import AVFoundation
import AVKit
import SwiftUI

/// Full-screen intro video. Owns its player so re-renders of the parent don't restart playback.
struct IntroPlayerView: View {
    let url: URL
    @State private var player: AVPlayer

    init(url: URL) {
        self.url = url
        _player = State(initialValue: AVPlayer(url: url))
    }

    var body: some View {
        VideoPlayer(player: player)
            .ignoresSafeArea()
            .onAppear {
                try? AVAudioSession.sharedInstance().setCategory(.playback)
                player.play()
            }
            .onDisappear { player.pause() }
    }
}
