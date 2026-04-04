import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const introSource = require('@/assets/intro.mov');

type Props = {
  onDone: () => void;
};

export default function IntroVideo({ onDone }: Props) {
  const [videoEnded, setVideoEnded] = useState(false);

  // Animated values
  const containerOpacity = useRef(new Animated.Value(1)).current;
  const buttonOpacity = useRef(new Animated.Value(0)).current;

  const player = useVideoPlayer(introSource, (p) => {
    p.loop = false;
    p.play();
  });

  useEffect(() => {
    const sub = player.addListener('statusChange', (payload) => {
      if (payload.status === 'idle' && !videoEnded) {
        // Video has finished playing – 'idle' fires after playback ends
        // We also check that it played at least a bit to avoid the initial idle
      }
    });
    return () => sub.remove();
  }, [player, videoEnded]);

  useEffect(() => {
    const sub = player.addListener('playingChange', (payload) => {
      // When playing becomes false and status becomes idle, video ended
      if (!payload.isPlaying) {
        // Small delay to confirm it's actually finished (not buffering)
        const timer = setTimeout(() => {
          if (player.currentTime > 0 && !videoEnded) {
            setVideoEnded(true);
          }
        }, 300);
        return () => clearTimeout(timer);
      }
    });
    return () => sub.remove();
  }, [player, videoEnded]);

  // Fade in the Enter button when video ends
  useEffect(() => {
    if (videoEnded) {
      Animated.timing(buttonOpacity, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }).start();
    }
  }, [videoEnded, buttonOpacity]);

  const handleEnter = useCallback(() => {
    Animated.timing(containerOpacity, {
      toValue: 0,
      duration: 500,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onDone();
    });
  }, [containerOpacity, onDone]);

  return (
    <Animated.View style={[styles.container, { opacity: containerOpacity }]}>
      <VideoView
        player={player}
        style={styles.video}
        nativeControls={false}
        contentFit="cover"
      />

      {videoEnded && (
        <Animated.View style={[styles.buttonWrap, { opacity: buttonOpacity }]}>
          <Pressable
            onPress={handleEnter}
            style={({ pressed }) => [
              styles.enterButton,
              pressed && styles.enterButtonPressed,
            ]}
          >
            <Text style={styles.enterText}>Enter</Text>
          </Pressable>
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    backgroundColor: '#000',
  },
  video: {
    width: SCREEN_W,
    height: SCREEN_H,
  },
  buttonWrap: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  enterButton: {
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 30,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.6)',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  enterButtonPressed: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  enterText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
});
