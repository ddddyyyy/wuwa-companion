import XCTest
@testable import WuWaCore

final class CoreTests: XCTestCase {
    func testUIDParsing() throws {
        XCTAssertEqual(try WuWaBuildsClient.uid(from: "701776400"), "701776400")
        XCTAssertEqual(
            try WuWaBuildsClient.uid(from: "https://wuwa.build/profile/701776400"),
            "701776400"
        )
        XCTAssertThrowsError(try WuWaBuildsClient.uid(from: "https://example.com/profile/701776400"))
    }

    func testGenericScoreIsBoundedAndGraded() {
        let echo = Echo(
            id: "echo",
            cost: 4,
            level: 25,
            setId: 1,
            mainStat: RemoteStat(type: "Crit DMG", value: 44),
            subStats: [
                RemoteStat(type: "Crit Rate", value: 10.5),
                RemoteStat(type: "Crit DMG", value: 21),
                RemoteStat(type: "ATK%", value: 11.6),
                RemoteStat(type: "Basic Attack DMG Bonus", value: 11.6),
                RemoteStat(type: "DEF%", value: 14.7)
            ]
        )
        let score = EchoScorer.score(echo)
        XCTAssertEqual(score.value, 38)
        XCTAssertEqual(score.grade, "S")
    }

    func testDecodesCurrentWuWaBuildsShape() throws {
        let json = #"{"id":"build-id","owner":{"username":"User","uid":"701776400"},"character":{"id":"1510"},"weapon":{"id":"21040056","level":90,"rank":1},"sequence":0,"echoSummary":{"sets":{"26":5},"mainStats":[{"cost":4,"statType":"Crit DMG"},{"cost":3,"statType":"ATK%"},{"cost":3,"statType":"ATK%"},{"cost":1,"statType":"ATK%"},{"cost":1,"statType":"ATK%"}]},"cv":200,"timestamp":"2026-08-12T00:00:00Z","buildState":{"sequence":0,"weaponId":"21040056","echoPanels":[{"id":"1","level":25,"stats":{"mainStat":{"type":"Crit DMG","value":44},"subStats":[]},"phantom":false,"resolvedSetId":26},{"id":"2","level":25,"stats":{"mainStat":{"type":"ATK%","value":30},"subStats":[]},"phantom":false,"resolvedSetId":26},{"id":"3","level":25,"stats":{"mainStat":{"type":"ATK%","value":30},"subStats":[]},"phantom":false,"resolvedSetId":26},{"id":"4","level":25,"stats":{"mainStat":{"type":"ATK%","value":18},"subStats":[]},"phantom":false,"resolvedSetId":26},{"id":"5","level":25,"stats":{"mainStat":{"type":"ATK%","value":18},"subStats":[]},"phantom":false,"resolvedSetId":26}],"weaponRank":1,"characterId":"1510","weaponLevel":90,"characterLevel":90}}"#
        let detail = try JSONDecoder().decode(BuildDetail.self, from: Data(json.utf8))
        let build = try BuildNormalizer.normalize(detail)
        XCTAssertEqual(build.echoes.count, 5)
        XCTAssertEqual(build.echoes.first?.cost, 4)
    }
}
