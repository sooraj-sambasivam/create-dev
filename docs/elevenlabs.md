# ElevenLabs realtime STT (verified 2026-10-17)
- Packages: @elevenlabs/elevenlabs-js 2.73.0 (server), @elevenlabs/react 1.18.0 (useScribe), @elevenlabs/client 1.28.0.
- Token: POST https://api.elevenlabs.io/v1/single-use-token/realtime_scribe, header xi-api-key, no body -> {"token":"sutkn_..."}; 15 min, single use. SDK: el.tokens.singleUse.create("realtime_scribe").
- WS: wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=scribe_v2_realtime&token=...; audio_format pcm_16000 default; commit_strategy manual|vad|turn_prediction; include_timestamps; keyterms.
- Client msg: {"message_type":"input_audio_chunk","audio_base_64":"...","commit":false,"sample_rate":16000}.
- Server msgs: session_started, partial_transcript{text}, committed_transcript{text}, committed_transcript_with_timestamps, errors (auth_error, quota_exceeded, rate_limited, session_time_limit_exceeded, ...).
- Browser: useScribe({modelId:"scribe_v2_realtime", onPartialTranscript, onCommittedTranscript}) -> connect({token, microphone:{echoCancellation:true,noiseSuppression:true}}), disconnect, commit; state isConnected, partialTranscript, committedTranscripts[]. VAD/languageCode options on useScribe UNVERIFIED (check node_modules types).
- Batch fallback: POST https://api.elevenlabs.io/v1/speech-to-text multipart model_id=scribe_v2, file -> {text, words[]}.
- Pricing: realtime $0.39/h, batch $0.22/h; free plan 6 concurrent realtime sessions.
