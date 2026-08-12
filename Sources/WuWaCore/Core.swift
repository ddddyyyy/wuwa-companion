import Foundation

public enum WuWaError: LocalizedError, Equatable {
    case invalidProfile
    case invalidResponse
    case incompleteBuild(String)
    case http(Int)

    public var errorDescription: String? {
        switch self {
        case .invalidProfile: "请输入 9–10 位 UID 或 WuWaBuilds Profile 地址。"
        case .invalidResponse: "WuWaBuilds 返回了无法识别的数据。"
        case .incompleteBuild(let reason): "Build 暂时无法评分：\(reason)"
        case .http(let code): "WuWaBuilds 请求失败（HTTP \(code)）。"
        }
    }
}

public struct Owner: Codable, Sendable {
    public let username: String
    public let uid: String
}

public struct CharacterRef: Codable, Sendable {
    public let id: String
}

public struct WeaponRef: Codable, Sendable {
    public let id: String
    public let level: Int
    public let rank: Int
}

public struct MainStatSummary: Codable, Sendable {
    public let cost: Int
    public let statType: String
}

public struct EchoSummary: Codable, Sendable {
    public let sets: [String: Int]
    public let mainStats: [MainStatSummary]
}

public struct BuildSummary: Codable, Identifiable, Sendable {
    public let id: String
    public let owner: Owner
    public let character: CharacterRef
    public let weapon: WeaponRef
    public let sequence: Int
    public let echoSummary: EchoSummary
    public let cv: Double
    public let timestamp: String
}

public struct BuildPage: Codable, Sendable {
    public let builds: [BuildSummary]
    public let page: Int
    public let pageSize: Int
    public let total: Int
    public let uid: String
}

public struct RemoteStat: Codable, Sendable {
    public let type: String
    public let value: Double
}

public struct EchoStats: Codable, Sendable {
    public let mainStat: RemoteStat
    public let subStats: [RemoteStat]
}

public struct EchoPanel: Codable, Sendable {
    public let id: String
    public let level: Int
    public let stats: EchoStats
    public let phantom: Bool
    public let resolvedSetId: Int
}

public struct BuildState: Codable, Sendable {
    public let sequence: Int
    public let weaponId: String
    public let echoPanels: [EchoPanel]
    public let weaponRank: Int
    public let characterId: String
    public let weaponLevel: Int
    public let characterLevel: Int
}

public struct BuildDetail: Codable, Identifiable, Sendable {
    public let id: String
    public let owner: Owner
    public let character: CharacterRef
    public let weapon: WeaponRef
    public let sequence: Int
    public let echoSummary: EchoSummary
    public let cv: Double
    public let timestamp: String
    public let buildState: BuildState
}

public struct Echo: Codable, Identifiable, Sendable {
    public let id: String
    public let cost: Int
    public let level: Int
    public let setId: Int
    public let mainStat: RemoteStat
    public let subStats: [RemoteStat]
}

public struct Build: Codable, Identifiable, Sendable {
    public let id: String
    public let uid: String
    public let username: String
    public let characterId: String
    public let weaponId: String
    public let sequence: Int
    public let cv: Double
    public let timestamp: String
    public let echoes: [Echo]
}

public enum BuildNormalizer {
    public static func normalize(_ detail: BuildDetail) throws -> Build {
        let panels = detail.buildState.echoPanels
        let mains = detail.echoSummary.mainStats
        guard panels.count == 5, mains.count == 5, panels.count == mains.count else {
            throw WuWaError.incompleteBuild("WuWaBuilds 没有返回完整的五件声骸")
        }

        let echoes = try zip(panels, mains).map { panel, summary in
            guard panel.level >= 0, panel.level <= 25,
                  panel.stats.subStats.count <= 5,
                  panel.stats.mainStat.type == summary.statType else {
                throw WuWaError.incompleteBuild("声骸主词条或等级字段不一致")
            }
            return Echo(
                id: panel.id,
                cost: summary.cost,
                level: panel.level,
                setId: panel.resolvedSetId,
                mainStat: panel.stats.mainStat,
                subStats: panel.stats.subStats
            )
        }

        return Build(
            id: detail.id,
            uid: detail.owner.uid,
            username: detail.owner.username,
            characterId: detail.character.id,
            weaponId: detail.weapon.id,
            sequence: detail.sequence,
            cv: detail.cv,
            timestamp: detail.timestamp,
            echoes: echoes
        )
    }
}

public struct EchoScore: Identifiable, Sendable {
    public let id: String
    public let value: Double
    public let grade: String
    public let contributions: [(name: String, value: Double)]
}

public struct BuildScore: Sendable {
    public let echoes: [EchoScore]
    public var total: Double { echoes.reduce(0) { $0 + $1.value } }
    public var weakest: EchoScore? { echoes.min { $0.value < $1.value } }
}

public enum EchoScorer {
    // 通用输出试算。角色专属配置加入后，用配置覆盖这两张表。
    private static let weights: [String: Double] = [
        "Crit Rate": 1, "Crit DMG": 1, "ATK%": 1, "ATK": 0.6,
        "Energy Regen": 0.5, "Basic Attack DMG Bonus": 0.8,
        "Heavy Attack DMG Bonus": 0.8, "Resonance Skill DMG Bonus": 0.8,
        "Resonance Liberation DMG Bonus": 0.8
    ]
    private static let maximumRoll: [String: Double] = [
        "Crit Rate": 10.5, "Crit DMG": 21, "ATK%": 11.6, "ATK": 60,
        "Energy Regen": 12.4, "Basic Attack DMG Bonus": 11.6,
        "Heavy Attack DMG Bonus": 11.6, "Resonance Skill DMG Bonus": 11.6,
        "Resonance Liberation DMG Bonus": 11.6
    ]

    public static func score(_ build: Build) -> BuildScore {
        BuildScore(echoes: build.echoes.map(score))
    }

    public static func score(_ echo: Echo) -> EchoScore {
        let contributions = echo.subStats.map { stat -> (String, Double) in
            guard let weight = weights[stat.type], let maximum = maximumRoll[stat.type] else {
                return (stat.type, 0)
            }
            return (stat.type, min(stat.value / maximum, 1) * 10 * weight)
        }
        let value = min(contributions.reduce(0) { $0 + $1.1 }, 50)
        return EchoScore(
            id: echo.id,
            value: (value * 100).rounded(.down) / 100,
            grade: grade(value),
            contributions: contributions
        )
    }

    private static func grade(_ value: Double) -> String {
        switch value {
        case 42...: "SSS"
        case 39...: "SS"
        case 35...: "S"
        case 30...: "A"
        case 24...: "B"
        default: "C"
        }
    }
}

public actor WuWaBuildsClient {
    private let session: URLSession
    private let baseURL = URL(string: "https://api.wuwa.build")!

    public init(session: URLSession = .shared) {
        self.session = session
    }

    public static func uid(from input: String) throws -> String {
        let value = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if (9...10).contains(value.count), value.allSatisfy(\.isNumber) { return value }
        guard let url = URL(string: value), url.scheme == "https", url.host == "wuwa.build" else {
            throw WuWaError.invalidProfile
        }
        let parts = url.pathComponents.filter { $0 != "/" }
        guard parts.count == 2, parts[0] == "profile",
              (9...10).contains(parts[1].count), parts[1].allSatisfy(\.isNumber) else {
            throw WuWaError.invalidProfile
        }
        return parts[1]
    }

    public func latestBuilds(for input: String) async throws -> [Build] {
        let uid = try Self.uid(from: input)
        let summaries = try await allSummaries(uid: uid)
        let latest = Dictionary(grouping: summaries, by: { $0.character.id })
            .compactMap { $0.value.max { $0.timestamp < $1.timestamp } }
            .sorted { $0.timestamp > $1.timestamp }
        var builds: [Build] = []
        for summary in latest {
            let detail: BuildDetail = try await get("build/\(summary.id)")
            builds.append(try BuildNormalizer.normalize(detail))
        }
        return builds
    }

    private func allSummaries(uid: String) async throws -> [BuildSummary] {
        var page = 1
        var builds: [BuildSummary] = []
        var total = Int.max
        repeat {
            let result: BuildPage = try await get("profile/\(uid)/builds?page=\(page)&pageSize=50")
            builds.append(contentsOf: result.builds)
            total = result.total
            page += 1
            if result.builds.isEmpty { break }
        } while builds.count < total
        return builds
    }

    private func get<T: Decodable & Sendable>(_ path: String) async throws -> T {
        guard let url = URL(string: path, relativeTo: baseURL),
              url.scheme == "https", url.host == baseURL.host else { throw WuWaError.invalidResponse }
        let (data, response) = try await session.data(from: url)
        guard let http = response as? HTTPURLResponse else { throw WuWaError.invalidResponse }
        guard http.url?.scheme == "https", http.url?.host == baseURL.host else {
            throw WuWaError.invalidResponse
        }
        guard http.statusCode == 200 else { throw WuWaError.http(http.statusCode) }
        do { return try JSONDecoder().decode(T.self, from: data) }
        catch { throw WuWaError.invalidResponse }
    }
}

public struct BuildCache: Sendable {
    private let fileURL: URL

    public init(fileURL: URL? = nil) {
        if let fileURL { self.fileURL = fileURL; return }
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        self.fileURL = base.appending(path: "WuWaCompanion/build-cache.json")
    }

    public func load() -> [Build] {
        guard let data = try? Data(contentsOf: fileURL) else { return [] }
        return (try? JSONDecoder().decode([Build].self, from: data)) ?? []
    }

    public func save(_ builds: [Build]) throws {
        let directory = fileURL.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let data = try JSONEncoder().encode(builds)
        try data.write(to: fileURL, options: .atomic)
    }
}
