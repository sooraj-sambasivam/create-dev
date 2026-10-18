// Render page 1 of a PDF with CoreGraphics (the renderer Preview uses) at 96 dpi: pdf2png in.pdf out.png
import CoreGraphics
import ImageIO
import Foundation
import UniformTypeIdentifiers
let a = CommandLine.arguments
let doc = CGPDFDocument(URL(fileURLWithPath: a[1]) as CFURL)!
let page = doc.page(at: 1)!
let box = page.getBoxRect(.mediaBox)
let s = 96.0 / 72.0
let w = Int((box.width * s).rounded()), h = Int((box.height * s).rounded())
let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1)); ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
ctx.scaleBy(x: s, y: s)
ctx.drawPDFPage(page)
let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: a[2]) as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(dest, ctx.makeImage()!, nil); CGImageDestinationFinalize(dest)
print(w, h)
