import SwiftUI

struct ContentView: View {
    var body: some View {
        VStack(spacing: 12) {
            Text("PrintPilot Native")
                .font(.largeTitle)
                .fontWeight(.semibold)
            Text("Native macOS migration shell")
                .font(.title3)
                .foregroundStyle(.secondary)
        }
        .frame(minWidth: 640, minHeight: 420)
        .padding()
    }
}
