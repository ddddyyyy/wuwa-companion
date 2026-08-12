import SwiftUI
import WuWaCore

@main
struct WuWaCompanionApp: App {
    var body: some Scene {
        WindowGroup("WuWa Companion") { ContentView() }
            .defaultSize(width: 980, height: 680)
    }
}

@MainActor
final class AppModel: ObservableObject {
    @Published var input = ""
    @Published var builds: [Build]
    @Published var isLoading = false
    @Published var message = "输入 WuWaBuilds UID 开始同步"

    private let client = WuWaBuildsClient()
    private let cache = BuildCache()
    private var lastSuccessfulRefresh: Date?

    init() {
        builds = cache.load()
        if let uid = builds.first?.uid {
            input = uid
            message = "正在显示上一次同步结果"
        }
    }

    func refresh() {
        guard !isLoading else { return }
        if let lastSuccessfulRefresh, Date().timeIntervalSince(lastSuccessfulRefresh) < 300 {
            message = "五分钟内已同步过，正在使用本地缓存"
            return
        }
        isLoading = true
        message = "正在读取 WuWaBuilds…"
        Task {
            defer { isLoading = false }
            do {
                let result = try await client.latestBuilds(for: input)
                try cache.save(result)
                builds = result
                lastSuccessfulRefresh = Date()
                message = result.isEmpty ? "这个 UID 暂无公开 Build" : "已同步 \(result.count) 个角色"
            } catch {
                message = error.localizedDescription
            }
        }
    }
}

struct ContentView: View {
    @StateObject private var model = AppModel()

    var body: some View {
        NavigationSplitView {
            List {
                Label("角色与声骸", systemImage: "waveform.path.ecg")
                Label("抽卡分析（下一步）", systemImage: "sparkles")
                    .foregroundStyle(.secondary)
            }
            .navigationTitle("WuWa Companion")
        } detail: {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    TextField("UID 或 WuWaBuilds Profile 地址", text: $model.input)
                        .textFieldStyle(.roundedBorder)
                        .onSubmit(model.refresh)
                    Button("刷新", action: model.refresh)
                        .disabled(model.isLoading)
                }
                Text(model.message).font(.callout).foregroundStyle(.secondary)

                if model.isLoading {
                    ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if model.builds.isEmpty {
                    ContentUnavailableView("暂无 Build", systemImage: "person.crop.rectangle")
                } else {
                    List(model.builds) { build in
                        BuildRow(build: build)
                    }
                    .listStyle(.inset)
                }
            }
            .padding(20)
            .navigationTitle("角色与声骸")
        }
    }
}

private struct BuildRow: View {
    let build: Build
    private var score: BuildScore { EchoScorer.score(build) }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                VStack(alignment: .leading) {
                    Text("角色 \(build.characterId)").font(.headline)
                    Text("武器 \(build.weaponId) · S\(build.sequence) · CV \(build.cv, specifier: "%.1f")")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                VStack(alignment: .trailing) {
                    Text("\(score.total, specifier: "%.1f") / 250").font(.title3).bold()
                    Text("通用输出试算").font(.caption2).foregroundStyle(.orange)
                }
            }
            HStack(spacing: 8) {
                ForEach(Array(zip(build.echoes, score.echoes)), id: \.0.id) { echo, echoScore in
                    DisclosureGroup {
                        VStack(alignment: .leading, spacing: 3) {
                            Text("主词条  \(echo.mainStat.type) \(echo.mainStat.value, specifier: "%.1f")")
                            ForEach(Array(echo.subStats.enumerated()), id: \.offset) { _, stat in
                                Text("\(stat.type)  \(stat.value, specifier: "%.1f")")
                            }
                        }
                        .font(.caption2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, 5)
                    } label: {
                        VStack(spacing: 3) {
                            Text("\(echo.cost)C").font(.caption)
                            Text(echoScore.grade).bold()
                            Text(echoScore.value, format: .number.precision(.fractionLength(1)))
                                .font(.caption2).foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(8)
                    .background(.quaternary, in: RoundedRectangle(cornerRadius: 8))
                }
            }
            if let weakest = score.weakest {
                Text("优先检查：\(weakest.grade) · \(weakest.value, specifier: "%.1f") 分")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 8)
    }
}
