// app/(tabs)/fitness.tsx
import '../../utils/polyfills';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Canvas, useThree, useFrame } from '@react-three/fiber/native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as THREE from 'three';
import { GLTFLoader } from 'three-stdlib';
import { Asset } from 'expo-asset';
import Animated, { useSharedValue } from 'react-native-reanimated';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';

type FitData = { center: THREE.Vector3; radius: number };

const NORMALIZE = {
  targetRadius: 1.2,
  minRadius: 0.12,
  maxRadius: 6.0,
};

function Model({ onFit }: { onFit: (f: FitData) => void }) {
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const asset = Asset.fromModule(require('../../assets/models/model.glb'));
      await asset.downloadAsync();
      const uri = asset.localUri ?? asset.uri;
      if (!uri) return;

      const ab = await (await fetch(uri)).arrayBuffer();
      const loader = new GLTFLoader();
      loader.parse(
        ab,
        '',
        (gltf) => {
          if (cancelled) return;
          const group = groupRef.current;
          if (!group) return;

          while (group.children.length) group.remove(group.children[0]);
          group.add(gltf.scene);

          const box = new THREE.Box3().setFromObject(gltf.scene);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          let radius = Math.max(size.x, size.y, size.z) * 0.5;

          gltf.scene.position.sub(center);

          let s = 1;
          if (radius < NORMALIZE.minRadius) s = NORMALIZE.targetRadius / Math.max(radius, 1e-6);
          else if (radius > NORMALIZE.maxRadius) s = NORMALIZE.targetRadius / radius;
          if (!Number.isFinite(s) || s <= 0) s = 1;
          gltf.scene.scale.setScalar(s);

          gltf.scene.updateMatrixWorld(true);
          const nBox = new THREE.Box3().setFromObject(gltf.scene);
          const nSize = nBox.getSize(new THREE.Vector3());
          radius = Math.max(nSize.x, nSize.y, nSize.z) * 0.5;

          onFit({ center: new THREE.Vector3(0, 0, 0), radius });
        },
        (err) => console.warn('GLB parse error', err)
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [onFit]);

  return <group ref={groupRef} />;
}

interface CameraControlsProps {
  fit: FitData | null;
  onReset: (fn: () => void) => void;
  theta: Animated.SharedValue<number>;
  phi: Animated.SharedValue<number>;
  zoom: Animated.SharedValue<number>;
  panX: Animated.SharedValue<number>;
  panY: Animated.SharedValue<number>;
}

function CameraControls({ fit, onReset, theta, phi, zoom, panX, panY }: CameraControlsProps) {
  const { camera, size } = useThree();
  const cam = camera as THREE.PerspectiveCamera;

  const targetRef = useRef(new THREE.Vector3(0, 0, 0));
  const spherical = useRef(new THREE.Spherical());
  const minDistance = useRef(0.6);
  const maxDistance = useRef(80);
  const initialized = useRef(false);

  useEffect(() => {
    if (!fit || initialized.current) return;

    const P = {
      minDistanceMult: 0.6,
      maxDistanceMult: 8.0,
      distanceFactor: 3.5,
      verticalLift: 0.35,
      fov: 36,
      ABS_MIN_DISTANCE: 0.6,
      ABS_MAX_DISTANCE: 12.0,
    };

    const { center, radius } = fit;
    cam.fov = P.fov;
    const distance = Math.max(radius * P.distanceFactor, P.ABS_MIN_DISTANCE + 0.2);
    cam.position.set(0, radius * P.verticalLift, distance);
    cam.near = Math.max(0.01, Math.min(0.5, radius * 0.01));
    cam.far = Math.max(8000, radius * 40);
    cam.updateProjectionMatrix();

    targetRef.current.copy(center);
    minDistance.current = Math.max(P.ABS_MIN_DISTANCE, radius * P.minDistanceMult);
    maxDistance.current = Math.max(P.ABS_MAX_DISTANCE, radius * P.maxDistanceMult);

    const offset = new THREE.Vector3();
    offset.copy(cam.position).sub(targetRef.current);
    spherical.current.setFromVector3(offset);

    // Initialize shared values with current spherical values
    theta.value = spherical.current.theta;
    phi.value = spherical.current.phi;
    zoom.value = spherical.current.radius;

    initialized.current = true;

    onReset(() => {
      cam.position.set(0, radius * P.verticalLift, distance);
      targetRef.current.copy(center);
      const offset = new THREE.Vector3();
      offset.copy(cam.position).sub(targetRef.current);
      spherical.current.setFromVector3(offset);
      theta.value = spherical.current.theta;
      phi.value = spherical.current.phi;
      zoom.value = spherical.current.radius;
      panX.value = 0;
      panY.value = 0;
      cam.lookAt(center);
      cam.updateProjectionMatrix();
    });
  }, [fit, cam, onReset]);

  useFrame(() => {
    // Update rotation from shared values
    spherical.current.theta = theta.value;
    spherical.current.phi = Math.max(0.01, Math.min(Math.PI - 0.01, phi.value));
    spherical.current.makeSafe();

    // Update zoom from shared value
    spherical.current.radius = Math.max(minDistance.current, Math.min(maxDistance.current, zoom.value));

    // Apply pan from shared values
    if (panX.value !== 0 || panY.value !== 0) {
      const distance = cam.position.distanceTo(targetRef.current);
      const fov = cam.fov * Math.PI / 180;
      const targetHeight = 2 * Math.tan(fov / 2) * distance;
      const panScale = targetHeight / size.height;

      const panLeft = new THREE.Vector3();
      panLeft.setFromMatrixColumn(cam.matrix, 0);
      panLeft.multiplyScalar(-panX.value * panScale);

      const panUp = new THREE.Vector3();
      panUp.setFromMatrixColumn(cam.matrix, 1);
      panUp.multiplyScalar(panY.value * panScale);

      targetRef.current.add(panLeft).add(panUp);
      panX.value = 0;
      panY.value = 0;
    }

    // Update camera position
    const offset = new THREE.Vector3();
    offset.setFromSpherical(spherical.current);
    cam.position.copy(targetRef.current).add(offset);
    cam.lookAt(targetRef.current);
  });

  return null;
}

export default function FitnessScreen() {
  const insets = useSafeAreaInsets();
  const [fit, setFit] = useState<FitData | null>(null);
  const resetRef = useRef<() => void>(() => {});

  // Use shared values for reanimated worklets
  const theta = useSharedValue(0);
  const phi = useSharedValue(Math.PI / 2);
  const zoom = useSharedValue(2.8);
  const panX = useSharedValue(0);
  const panY = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .maxPointers(1)
    .onChange((e) => {
      'worklet';
      theta.value -= e.changeX * 0.01;
      phi.value -= e.changeY * 0.01;
    });

  const pinchGesture = Gesture.Pinch()
    .onChange((e) => {
      'worklet';
      const scaleFactor = e.scale > 1 ? 0.98 : 1.02;
      const newZoom = zoom.value * scaleFactor;
      // Cap the zoom between 0.6 and 5.0
      zoom.value = Math.max(0.6, Math.min(5.0, newZoom));
    });

  const twoFingerPan = Gesture.Pan()
    .minPointers(2)
    .onChange((e) => {
      'worklet';
      panX.value += e.changeX;
      panY.value += e.changeY;
    });

  const composed = Gesture.Race(
    twoFingerPan,
    Gesture.Simultaneous(panGesture, pinchGesture)
  );

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={[styles.header, { paddingTop: insets.top + 16 }]} pointerEvents="box-none">
        <ThemedText type="title" style={styles.headerTitle}>
          Fitness
        </ThemedText>
        <TouchableOpacity
          onPress={() => resetRef.current?.()}
          style={styles.resetBtn}
          accessibilityLabel="Reset 3D view"
        >
          <ThemedText style={styles.resetText}>Reset View</ThemedText>
        </TouchableOpacity>
      </ThemedView>

      <GestureDetector gesture={composed}>
        <Animated.View style={styles.canvasWrap} collapsable={false}>
          <Canvas
            style={{ flex: 1 }}
            dpr={[1, 2]}
            camera={{ position: [0, 1.6, 2.8], fov: 36 }}
            frameloop="always"
            onCreated={({ gl }) => {
              gl.outputColorSpace = THREE.SRGBColorSpace;
              gl.toneMapping = THREE.ACESFilmicToneMapping;
            }}
          >
            <ambientLight intensity={1.5} />
            <directionalLight position={[5, 5, 5]} intensity={1.0} />
            <directionalLight position={[-5, -5, -5]} intensity={0.7} />
            <directionalLight position={[0, -5, 0]} intensity={0.5} />

            <Suspense fallback={null}>
              <Model onFit={setFit} />
            </Suspense>

            <CameraControls
              fit={fit}
              onReset={(fn) => { resetRef.current = fn; }}
              theta={theta}
              phi={phi}
              zoom={zoom}
              panX={panX}
              panY={panY}
            />
          </Canvas>
        </Animated.View>
      </GestureDetector>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  header: {
    alignItems: 'center',
    paddingBottom: 12,
    backgroundColor: 'rgba(18,18,18,0.95)',
    zIndex: 2,
  },
  headerTitle: { color: '#EAEAEA' },
  resetBtn: {
    position: 'absolute',
    right: 16,
    bottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(234,234,234,0.08)',
  },
  resetText: { color: '#EAEAEA', fontSize: 12 },
  canvasWrap: { flex: 1 },
});
