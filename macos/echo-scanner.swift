import AppKit
import ApplicationServices
import Foundation
import ScreenCaptureKit
import Vision

struct GameWindow {
    let window: SCWindow
    let pid: pid_t
    let bounds: CGRect
    let owner: String
}

struct Region {
    let x: CGFloat, y: CGFloat, width: CGFloat, height: CGFloat
    func crop(in image: CGImage, baseWidth: CGFloat, baseHeight: CGFloat) -> CGRect {
        CGRect(x: x / baseWidth * CGFloat(image.width), y: y / baseHeight * CGFloat(image.height),
               width: width / baseWidth * CGFloat(image.width), height: height / baseHeight * CGFloat(image.height)).integral
    }
    func point(in window: CGRect, baseWidth: CGFloat, baseHeight: CGFloat) -> CGPoint {
        CGPoint(x: window.minX + x / baseWidth * window.width, y: window.minY + y / baseHeight * window.height)
    }
}

struct Layout {
    let width: CGFloat, height: CGFloat
    let count, grid, card, statNames, statValues, sonata: Region
    let gapX, gapY: CGFloat

    static func forWindow(_ bounds: CGRect) -> Layout {
        if bounds.width / bounds.height < 1.7 {
            return Layout(width: 1680, height: 1050,
                count: Region(x: 175, y: 40, width: 130, height: 40),
                grid: Region(x: 180, y: 104, width: 130, height: 162),
                card: Region(x: 1136, y: 152, width: 486, height: 152),
                statNames: Region(x: 1200, y: 420, width: 320, height: 380),
                statValues: Region(x: 1510, y: 420, width: 100, height: 380),
                sonata: Region(x: 1135, y: 400, width: 486, height: 408), gapX: 16, gapY: 24)
        }
        return Layout(width: 1920, height: 1080,
            count: Region(x: 200, y: 50, width: 130, height: 40),
            grid: Region(x: 205, y: 122, width: 151, height: 181),
            card: Region(x: 1296, y: 114, width: 558, height: 170),
            statNames: Region(x: 1380, y: 430, width: 360, height: 380),
            statValues: Region(x: 1740, y: 430, width: 100, height: 380),
            sonata: Region(x: 1298, y: 397, width: 554, height: 467), gapX: 16, gapY: 24)
    }
}

struct RawEcho: Codable {
    let index: Int
    let card: [String]
    let statNames: [String]
    let statValues: [String]
    let sonata: [String]
    let screenshot: String?
}

struct ScanResult: Codable {
    let requested: Int
    let detected: Int
    let cancelled: Bool
    let windowOwner: String
    let echoes: [RawEcho]
}

struct CheckResult: Codable {
    let platform: String
    let screenCapture: Bool
    let accessibility: Bool
    let gameFound: Bool
}

enum ScannerError: LocalizedError {
    case message(String)
    var errorDescription: String? { if case .message(let text) = self { return text }; return nil }
}

func gameWindow() async throws -> GameWindow? {
    let content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: false)
    let candidates = content.windows.compactMap { window -> GameWindow? in
        let owner = window.owningApplication?.applicationName ?? ""
        let title = window.title ?? ""
        let searchable = "\(owner) \(title)".lowercased()
        guard searchable.contains("wuthering") || searchable.contains("鸣潮") || searchable.contains("kurogame") else { return nil }
        guard let application = window.owningApplication, window.frame.width >= 1000, window.frame.height >= 600 else { return nil }
        return GameWindow(window: window, pid: application.processID, bounds: window.frame, owner: owner)
    }
    return candidates.max { $0.bounds.width * $0.bounds.height < $1.bounds.width * $1.bounds.height }
}

func capture(_ window: GameWindow) async throws -> CGImage {
    let configuration = SCStreamConfiguration()
    configuration.width = Int(window.bounds.width)
    configuration.height = Int(window.bounds.height)
    configuration.showsCursor = false
    return try await SCScreenshotManager.captureImage(contentFilter: SCContentFilter(desktopIndependentWindow: window.window), configuration: configuration)
}

func recognize(_ image: CGImage, region: Region, layout: Layout) throws -> [String] {
    guard let cropped = image.cropping(to: region.crop(in: image, baseWidth: layout.width, baseHeight: layout.height)) else { return [] }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["zh-Hans", "en-US"]
    request.usesLanguageCorrection = true
    request.minimumTextHeight = 0.018
    try VNImageRequestHandler(cgImage: cropped, orientation: .up).perform([request])
    return (request.results ?? []).sorted {
        abs($0.boundingBox.midY - $1.boundingBox.midY) > 0.025 ? $0.boundingBox.midY > $1.boundingBox.midY : $0.boundingBox.minX < $1.boundingBox.minX
    }.compactMap { $0.topCandidates(1).first?.string.trimmingCharacters(in: .whitespacesAndNewlines) }
}

func click(_ point: CGPoint) {
    CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: .left)?.post(tap: .cghidEventTap)
    usleep(40_000)
    CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: point, mouseButton: .left)?.post(tap: .cghidEventTap)
    CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: point, mouseButton: .left)?.post(tap: .cghidEventTap)
}

func scroll(_ lines: Int32, at point: CGPoint) {
    CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: .left)?.post(tap: .cghidEventTap)
    CGEvent(scrollWheelEvent2Source: nil, units: .line, wheelCount: 1, wheel1: lines, wheel2: 0, wheel3: 0)?.post(tap: .cghidEventTap)
}

func saveDiagnostic(_ image: CGImage, index: Int, directory: String) -> String? {
    let url = URL(fileURLWithPath: directory).appendingPathComponent("echo-\(index + 1).png")
    try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    guard let data = NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:]) else { return nil }
    do { try data.write(to: url); return url.path } catch { return nil }
}

func requirePermissions() throws {
    if !CGPreflightScreenCaptureAccess() {
        _ = CGRequestScreenCaptureAccess()
        throw ScannerError.message("请在“系统设置 → 隐私与安全性 → 屏幕与系统录音”允许本工具，然后重新扫描")
    }
    let prompt = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
    if !AXIsProcessTrustedWithOptions(prompt) {
        throw ScannerError.message("请在“系统设置 → 隐私与安全性 → 辅助功能”允许本工具，然后重新扫描")
    }
}

func detectedCount(_ window: GameWindow, layout: Layout) async throws -> Int {
    let text = try recognize(await capture(window), region: layout.count, layout: layout).joined(separator: " ")
    let expression = try NSRegularExpression(pattern: #"([0-9]{1,4})\s*/"#)
    let range = NSRange(text.startIndex..., in: text)
    if let match = expression.firstMatch(in: text, range: range), let valueRange = Range(match.range(at: 1), in: text), let count = Int(text[valueRange]) { return count }
    throw ScannerError.message("无法识别声骸数量，请在页面中手动填写要扫描的数量")
}

func scan(limit: Int, diagnostics: String) async throws -> ScanResult {
    try requirePermissions()
    guard let window = try await gameWindow() else { throw ScannerError.message("没有找到鸣潮游戏窗口") }
    NSRunningApplication(processIdentifier: window.pid)?.activate(options: [.activateAllWindows])
    try await Task.sleep(for: .seconds(1))
    guard let activeWindow = try await gameWindow() else { throw ScannerError.message("鸣潮窗口激活失败") }
    let layout = Layout.forWindow(activeWindow.bounds)
    let detected = limit > 0 ? limit : try await detectedCount(activeWindow, layout: layout)
    let requested = limit > 0 ? min(limit, detected) : detected
    var echoes: [RawEcho] = []
    var cancelled = false

    for index in 0..<requested {
        if CGEventSource.keyState(.combinedSessionState, key: 53) { cancelled = true; break }
        let slot = index % 24
        if slot == 0 && index > 0 {
            let gridCenter = CGPoint(x: activeWindow.bounds.minX + activeWindow.bounds.width * 0.35,
                                     y: activeWindow.bounds.minY + activeWindow.bounds.height * 0.55)
            scroll(-32, at: gridCenter)
            try await Task.sleep(for: .seconds(1))
        }
        let row = slot / 6, column = slot % 6
        let item = Region(x: layout.grid.x + CGFloat(column) * (layout.grid.width + layout.gapX) + layout.grid.width / 2,
                          y: layout.grid.y + CGFloat(row) * (layout.grid.height + layout.gapY) + layout.grid.height / 2,
                          width: 0, height: 0)
        click(item.point(in: activeWindow.bounds, baseWidth: layout.width, baseHeight: layout.height))
        try await Task.sleep(for: .milliseconds(240))
        let image = try await capture(activeWindow)
        let card = try recognize(image, region: layout.card, layout: layout)
        let names = try recognize(image, region: layout.statNames, layout: layout)
        let values = try recognize(image, region: layout.statValues, layout: layout)

        let detailPoint = Region(x: layout.sonata.x + layout.sonata.width / 2, y: layout.sonata.y + layout.sonata.height / 2,
                                 width: 0, height: 0).point(in: activeWindow.bounds, baseWidth: layout.width, baseHeight: layout.height)
        scroll(-9, at: detailPoint)
        try await Task.sleep(for: .milliseconds(180))
        let sonataImage = try await capture(activeWindow)
        let sonata = try recognize(sonataImage, region: layout.sonata, layout: layout)
        scroll(9, at: detailPoint)
        try await Task.sleep(for: .milliseconds(120))
        let screenshot = card.isEmpty || names.count < 2 || values.count < 2 ? saveDiagnostic(image, index: index, directory: diagnostics) : nil
        echoes.append(RawEcho(index: index, card: card, statNames: names, statValues: values, sonata: sonata, screenshot: screenshot))
    }
    return ScanResult(requested: requested, detected: detected, cancelled: cancelled, windowOwner: activeWindow.owner, echoes: echoes)
}

func printJSON<T: Encodable>(_ value: T) throws {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    FileHandle.standardOutput.write(try encoder.encode(value))
}

@main
struct Main {
    static func main() async {
        do {
            let arguments = CommandLine.arguments
            if arguments.contains("--check") {
                let running = NSWorkspace.shared.runningApplications.contains { application in
                    let name = application.localizedName?.lowercased() ?? ""
                    return name.contains("wuthering") || name.contains("鸣潮") || name.contains("kurogame")
                }
                try printJSON(CheckResult(platform: "macos", screenCapture: CGPreflightScreenCaptureAccess(), accessibility: AXIsProcessTrusted(), gameFound: running))
            } else {
                let limit = arguments.firstIndex(of: "--limit").flatMap { $0 + 1 < arguments.count ? Int(arguments[$0 + 1]) : nil } ?? 0
                let diagnostics = arguments.firstIndex(of: "--diagnostics").flatMap { $0 + 1 < arguments.count ? arguments[$0 + 1] : nil } ?? NSTemporaryDirectory()
                try await printJSON(scan(limit: limit, diagnostics: diagnostics))
            }
        } catch {
            FileHandle.standardError.write(Data((error.localizedDescription + "\n").utf8))
            exit(1)
        }
    }
}
