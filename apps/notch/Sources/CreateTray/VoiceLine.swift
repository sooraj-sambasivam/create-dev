import AVFoundation
import AudioToolbox
import CoreAudio

/// One spoken line for the Option-hold gesture: mic -> ElevenLabs Scribe realtime (VAD commit 0.5 s, word timestamps).
/// The first audio buffer's hostTime (mach clock) is the audio start; Scribe's word offsets are seconds from the first
/// sample sent, so a word's time is audioStart + offset, directly comparable with the pointer timeline.
@MainActor
final class VoiceLine {
    struct Word { let text: String; let start: Double; let end: Double }
    struct Result { let text: String; let words: [Word] }

    private let engine = AVAudioEngine()
    private var socket: URLSessionWebSocketTask?
    /// Written once from the audio thread (first buffer), read from the main actor.
    private final class StartBox: @unchecked Sendable {
        private let lock = NSLock()
        private var v: Double?
        var value: Double? { get { lock.lock(); defer { lock.unlock() }; return v } set { lock.lock(); v = newValue; lock.unlock() } }
    }
    private let startBox = StartBox()
    private var parts: [Result] = []
    private var pendingText = ""
    private var committed = false
    private var finished = false
    private var onResult: ((Result?) -> Void)?
    private var running = false

    private var audioStart: Double? { startBox.value }

    /// Single-use token from the Create server (the ElevenLabs key never leaves it). Nil when realtime is not available.
    static func fetchToken() async -> String? {
        var req = URLRequest(url: Endpoints.api.appendingPathComponent("api/voice-token"))
        req.cachePolicy = .reloadIgnoringLocalCacheData
        req.timeoutInterval = 3
        guard let (data, resp) = try? await URLSession.shared.data(for: req), (resp as? HTTPURLResponse)?.statusCode == 200,
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              obj["provider"] as? String == "elevenlabs", let token = obj["token"] as? String else { return nil }
        return token
    }

    static func micAllowed() async -> Bool {
        switch AVCaptureDevice.authorizationStatus(for: .audio) {
        case .authorized: return true
        case .notDetermined: return await AVCaptureDevice.requestAccess(for: .audio)
        default: return false
        }
    }

    func start(token: String) -> Bool {
        guard !running else { return false }
        var comps = URLComponents(string: "wss://api.elevenlabs.io/v1/speech-to-text/realtime")!
        comps.queryItems = [
            .init(name: "model_id", value: "scribe_v2_realtime"), .init(name: "audio_format", value: "pcm_16000"),
            .init(name: "commit_strategy", value: "vad"), .init(name: "vad_silence_threshold_secs", value: "0.5"),
            .init(name: "include_timestamps", value: "true"), .init(name: "token", value: token),
        ]
        let task = URLSession.shared.webSocketTask(with: comps.url!)
        socket = task
        task.resume()
        receive(task)

        let input = engine.inputNode
        let inFormat = input.outputFormat(forBus: 0)
        guard inFormat.sampleRate > 0,
              let outFormat = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16_000, channels: 1, interleaved: true),
              let converter = AVAudioConverter(from: inFormat, to: outFormat) else { task.cancel(with: .goingAway, reason: nil); return false }
        let latency = Self.inputLatencySec(engine: engine, sampleRate: inFormat.sampleRate)
        let box = startBox
        input.installTap(onBus: 0, bufferSize: 1024, format: inFormat) { buffer, when in
            if box.value == nil, when.isHostTimeValid {
                // Sample 0 of the stream: the capture time of this buffer's first frame, less the device's own latency.
                box.value = AVAudioTime.seconds(forHostTime: when.hostTime) - latency
            }
            let cap = AVAudioFrameCount(Double(buffer.frameLength) * 16_000 / inFormat.sampleRate) + 32
            guard let out = AVAudioPCMBuffer(pcmFormat: outFormat, frameCapacity: cap) else { return }
            var fed = false
            var err: NSError?
            converter.convert(to: out, error: &err) { _, status in
                if fed { status.pointee = .noDataNow; return nil }
                fed = true; status.pointee = .haveData; return buffer
            }
            guard err == nil, out.frameLength > 0, let ch = out.int16ChannelData?[0] else { return }
            let data = Data(bytes: ch, count: Int(out.frameLength) * 2)
            let msg: [String: Any] = ["message_type": "input_audio_chunk", "audio_base_64": data.base64EncodedString(), "sample_rate": 16_000, "commit": false]
            if let json = try? JSONSerialization.data(withJSONObject: msg), let str = String(data: json, encoding: .utf8) { task.send(.string(str)) { _ in } }
        }
        do { try engine.start() } catch { input.removeTap(onBus: 0); task.cancel(with: .goingAway, reason: nil); return false }
        running = true
        return true
    }

    /// The key went up: commit what is buffered (shortly, so the last block is out) and deliver the line.
    func finish(_ done: @escaping (Result?) -> Void) {
        guard running, !committed else { done(nil); return }
        committed = true
        onResult = done
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
            self?.send(["message_type": "input_audio_chunk", "audio_base_64": "", "sample_rate": 16_000, "commit": true])
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { [weak self] in self?.resolve() }
    }

    func cancel() {
        onResult = nil
        finished = true
        teardown()
    }

    private func send(_ obj: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: obj), let s = String(data: data, encoding: .utf8) else { return }
        socket?.send(.string(s)) { _ in }
    }

    private func receive(_ task: URLSessionWebSocketTask) {
        task.receive { [weak self] result in
            Task { @MainActor in
                guard let self, self.socket === task else { return }
                switch result {
                case .failure: self.resolve()
                case .success(let msg):
                    if case .string(let s) = msg, let d = s.data(using: .utf8), let obj = try? JSONSerialization.jsonObject(with: d) as? [String: Any] { self.handle(obj) }
                    self.receive(task)
                }
            }
        }
    }

    private func handle(_ m: [String: Any]) {
        switch m["message_type"] as? String {
        case "committed_transcript":
            pendingText = ((m["text"] as? String) ?? "").trimmingCharacters(in: .whitespaces)
            // The word times follow within ~20 ms; do not wait longer than 250 ms for them.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self] in self?.flushPending(nil) }
        case "committed_transcript_with_timestamps":
            flushPending(m)
        default: break
        }
    }

    private func flushPending(_ m: [String: Any]?) {
        let text = (((m?["text"] as? String) ?? pendingText)).trimmingCharacters(in: .whitespaces)
        pendingText = ""
        if !text.isEmpty {
            var words: [Word] = []
            if let start = audioStart, let raw = m?["words"] as? [[String: Any]] {
                for w in raw where (w["type"] as? String) != "spacing" {
                    guard let t = w["text"] as? String, let s = (w["start"] as? NSNumber)?.doubleValue, let e = (w["end"] as? NSNumber)?.doubleValue else { continue }
                    words.append(Word(text: t.trimmingCharacters(in: .whitespaces), start: start + s, end: start + e))
                }
            }
            parts.append(Result(text: text, words: words))
        }
        // After release the next commit answers it (an empty one when VAD already took everything).
        if committed { resolve() }
    }

    private func resolve() {
        guard !finished else { return }
        finished = true
        let text = parts.map(\.text).joined(separator: " ")
        let result = text.isEmpty ? nil : Result(text: text, words: parts.flatMap(\.words))
        let cb = onResult
        onResult = nil
        teardown()
        cb?(result)
    }

    private func teardown() {
        if running { engine.inputNode.removeTap(onBus: 0); engine.stop(); running = false }
        socket?.cancel(with: .goingAway, reason: nil)
        socket = nil
    }

    /// Input latency of the capture device: device + stream latency, safety offset, and one hardware buffer.
    private static func inputLatencySec(engine: AVAudioEngine, sampleRate: Double) -> Double {
        guard let unit = engine.inputNode.audioUnit else { return 0 }
        var dev = AudioDeviceID(0)
        var size = UInt32(MemoryLayout<AudioDeviceID>.size)
        guard AudioUnitGetProperty(unit, kAudioOutputUnitProperty_CurrentDevice, kAudioUnitScope_Global, 0, &dev, &size) == noErr, dev != 0 else { return 0 }
        func u32(_ selector: AudioObjectPropertySelector) -> Double {
            var addr = AudioObjectPropertyAddress(mSelector: selector, mScope: kAudioObjectPropertyScopeInput, mElement: kAudioObjectPropertyElementMain)
            var v = UInt32(0)
            var sz = UInt32(MemoryLayout<UInt32>.size)
            return AudioObjectGetPropertyData(dev, &addr, 0, nil, &sz, &v) == noErr ? Double(v) : 0
        }
        let frames = u32(kAudioDevicePropertyLatency) + u32(kAudioDevicePropertySafetyOffset) + u32(kAudioDevicePropertyBufferFrameSize)
        let sec = frames / max(sampleRate, 1)
        return min(max(sec, 0), 0.25)
    }
}
