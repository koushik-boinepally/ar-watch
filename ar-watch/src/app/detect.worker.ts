/// <reference lib="webworker" />

import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

let handLandmarker: HandLandmarker;

console.log('worker');

addEventListener('message', async (event) => {
    if (event.data.type === 'init') {
        console.log('init');

        const vision = await FilesetResolver.forVisionTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm'
        );
        handLandmarker = await HandLandmarker.createFromOptions(
            vision,
            {
                baseOptions: {
                    modelAssetPath: "assets/model/hand_landmarker.task",
                },
                numHands: 2
            });
        handLandmarker.setOptions({
            runningMode: 'VIDEO'
        });
        self.postMessage({ type: 'ready' });
    } else if (event.data.type === 'detect') {
        const { imageData, lastVideoTime } = event.data.payload;
        const detections = handLandmarker.detectForVideo(imageData, lastVideoTime);
        self.postMessage({ type: 'detections', payload: detections });
    }
});