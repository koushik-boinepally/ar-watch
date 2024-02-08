import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, NgZone, ViewChild } from '@angular/core';
import { FilesetResolver, HandLandmarker, HandLandmarkerResult, DrawingUtils, NormalizedLandmark, PoseLandmarker, PoseLandmarkerResult } from '@mediapipe/tasks-vision';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';


interface WorldLandmark {
  x: number;
  y: number;
  z: number;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements AfterViewInit {

  title = 'ar-watch';
  handLandmarker!: HandLandmarker;
  poseLandmarker!: PoseLandmarker;

  @ViewChild('video') video?: ElementRef<HTMLVideoElement>;
  @ViewChild('canvas') canvas!: ElementRef<HTMLCanvasElement>;

  wristWidth = 0;
  handOrientationRadians = 0;
  handOrientationDegrees = 0;

  handVector: WorldLandmark = {
    x: 0,
    y: 0,
    z: 0
  }

  upVector: WorldLandmark = {
    x: 0,
    y: 0,
    z: 0
  }

  rightVector: WorldLandmark = {
    x: 0,
    y: 0,
    z: 0
  }

  handPosition: WorldLandmark = {
    x: 0,
    y: 0,
    z: 0
  }

  constructor(
    private zone: NgZone,
    private changeDetectorRef: ChangeDetectorRef
  ) {
  }

  ngAfterViewInit(): void {

    const video = this.video?.nativeElement;
    if (!video) {
      return;
    }

    video.onloadedmetadata = () => {
      this.init();
    }

    video.onplay = () => {
      this.videoPlaying = true;
    }

    video.onpause = () => {
      this.videoPlaying = false;
    }

    // getUsermedia parameters.
    const constraints = {
      video: true
    };

    // video.addEventListener("loadeddata", this.initializeThreeJS.bind(this));

    this.zone.runOutsideAngular(async () => {
      await this.init();
      navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
        video.srcObject = stream;
        video.addEventListener("loadeddata", this.initializeThreeJS.bind(this));
      });
    });

  }

  videoPlaying = false;
  initialized = false;

  async init() {

    if (this.initialized) {
      return;
    }

    this.initialized = true;

    const wasm = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    );

    this.handLandmarker = await HandLandmarker.createFromOptions(
      wasm,
      {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
          delegate: 'CPU'
        },
        numHands: 1
      }
    );

    this.poseLandmarker = await PoseLandmarker.createFromOptions(
      wasm,
      {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
          delegate: 'CPU'
        },
        numPoses: 1
      }
    );


  }

  scene?: THREE.Scene;
  camera?: THREE.PerspectiveCamera;
  renderer?: THREE.WebGLRenderer;
  watchModel?: THREE.Object3D;


  initializeThreeJS() {

    // Scene
    this.scene = new THREE.Scene();

    // Camera
    const fov = 75; // Field of View
    const aspect = window.innerWidth / window.innerHeight; // Aspect ratio
    const near = 0.1; // Near clipping plane
    const far = 1000; // Far clipping plane
    this.camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    this.camera.position.z = 5; // Adjust as needed

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas.nativeElement, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    console.log('Size: ', window.innerWidth, window.innerHeight);

    // Resize listener to adjust camera aspect ratio and renderer size
    window.addEventListener('resize', () => {
      this.camera!.aspect = window.innerWidth / window.innerHeight;
      this.camera!.updateProjectionMatrix();
      this.renderer!.setSize(window.innerWidth, window.innerHeight);
    });

    // Load the watch model
    this.loadWatchModel();

    // Start the animation loop
    this.animate();

  }

  loadWatchModel() {
    const loader = new OBJLoader();


    loader.load('assets/models/bracelet/bracelet.obj', (obj) => {
      // Assuming 'obj' is your watch model
      this.watchModel = obj;

      // Compute the bounding box of the model
      const box = new THREE.Box3().setFromObject(this.watchModel);

      // Calculate the center of the bounding box
      const center = box.getCenter(new THREE.Vector3());

      // Translate the model's geometry so that the center of the bounding box is at the origin
      this.watchModel.position.sub(center);

      // Set the position of the watch model
      // You might want to adjust this based on the specific hand landmarks
      this.watchModel.position.set(0, 0, 0); // Adjust as necessary

      // Scale the model to fit the wrist width
      // This requires converting wrist width from normalized units to Three.js units
      const scale = this.calculateModelScale(this.wristWidth);

      this.watchModel.scale.set(scale, scale, scale);

      // Add the model to the scene
      this.scene!.add(this.watchModel);

      // Add a directional light
      const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
      directionalLight.position.set(5, 5, 5); // Adjust as needed
      this.scene!.add(directionalLight);

      // Add an ambient light for softer shadows and indirect lighting
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.5); // Adjust the color and intensity as needed
      this.scene!.add(ambientLight);


      // Update the model orientation
      this.updateModelOrientation();
    }, (p) => {

    }, (e) => {
      console.error(e);
    });
  }

  calculateModelScale(wristWidth: number): number {
    const baseScale = 0.01;
    const scaleMultiplier = 0.1;
    console.log('Scale: ', baseScale + (wristWidth * scaleMultiplier));
    return baseScale + (wristWidth * scaleMultiplier);
  }

  negate(vector: WorldLandmark): WorldLandmark {
    return {
      x: -vector.x,
      y: -vector.y,
      z: -vector.z,
    };
  }

  crossProduct(a: WorldLandmark, b: WorldLandmark): WorldLandmark {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x,
    };
  }

  quaternionFromVectors(x: WorldLandmark, y: WorldLandmark, z: WorldLandmark): THREE.Quaternion {
    const matrix = new THREE.Matrix4();
    matrix.set(
      x.x, y.x, z.x, 0,
      x.y, y.y, z.y, 0,
      x.z, y.z, z.z, 0,
      0, 0, 0, 1
    );

    return new THREE.Quaternion().setFromRotationMatrix(matrix);
  }

  updateModelOrientation() {
    const handLandmarks = this.results?.landmarks[0];
    const poseLandmarks = this.poseResult?.landmarks[0];

    if (!this.watchModel || !handLandmarks || !poseLandmarks) return;

    const wristPose = poseLandmarks[15]; 
    const elbowPose = poseLandmarks[13];
    const thumbPose = handLandmarks[4];
    const littleFingerPose = handLandmarks[20];

    const initialQuaternion = new THREE.Quaternion(1,0,1);

    // Set the watch model's quaternion to the initial quaternion
    this.watchModel.quaternion.copy(initialQuaternion);

    // Calculate the direction of the forearm
    const forearmDirection = this.normalize(this.vectorBetween(elbowPose, wristPose));

    // Calculate the direction the top of the hand is facing
    const handDirection = this.normalize(this.vectorBetween(thumbPose, littleFingerPose));

    // Use the forearm direction as the up vector for the watch
    const up = forearmDirection;

    // Use the negative hand direction as the forward vector for the watch
    const forward = this.negate(handDirection);

    // Calculate the right vector as the cross product of the up and forward vectors
    const right = this.crossProduct(up, forward);

    // Create a quaternion from the right, up, and forward vectors
    const targetQuaternion = this.quaternionFromVectors(right, up, forward);

    // Smoothly update the model's rotation to the target quaternion
    this.watchModel.quaternion.slerp(targetQuaternion, 1); // Adjust the lerp factor as needed for smoothness
  }

  updateModelScale() {
    if (!this.watchModel) return;

    // Scale the model to fit the wrist width
    // This requires converting wrist width from normalized units to Three.js units
    const scale = this.calculateModelScale(this.wristWidth);
    this.watchModel.scale.set(scale, scale, scale);
  }

  animate = () => {
    requestAnimationFrame(this.animate);

    this.prcessHandTracking();

    this.renderer!.render(this.scene!, this.camera!);
  }

  async prcessHandTracking() {
    const video = this.video?.nativeElement;

    if (!video || !this.videoPlaying) {
      return;
    }

    const videoAspectRatio = video.videoWidth / video.videoHeight;
    const windowAspectRatio = window.innerWidth / window.innerHeight;
    let displayWidth, displayHeight, offsetX, offsetY;


    if (videoAspectRatio > windowAspectRatio) {
      displayWidth = window.innerWidth;
      displayHeight = displayWidth / videoAspectRatio;
      offsetX = 0;
      offsetY = (window.innerHeight - displayHeight) / 2; // Center vertically
    } else {
      displayHeight = window.innerHeight;
      displayWidth = displayHeight * videoAspectRatio;
      offsetX = (window.innerWidth - displayWidth) / 2;
      offsetY = 0;
    }


    await Promise.all([
      this.handLandmarker.setOptions({ runningMode: "VIDEO" }),
      this.poseLandmarker.setOptions({ runningMode: "VIDEO" })
    ]);

    let startTimeMs = performance.now();
    if (this.lastVideoTime !== video.currentTime) {
      this.lastVideoTime = video.currentTime;
      // this.results = this.handLandmarker.detectForVideo(video, startTimeMs);
      // this.poseResult = this.poseLandmarker.detectForVideo(video, startTimeMs);
      const ls = await Promise.all([
        Promise.resolve(this.handLandmarker.detectForVideo(video, startTimeMs)), 
        Promise.resolve(this.poseLandmarker.detectForVideo(video, startTimeMs))
      ]);
      this.results = ls[0];
      this.poseResult = ls[1];
    }

    if (this.results) {
      if (this.results.landmarks.length > 0) {
        const landmarks = this.results.landmarks[0];

        const wristWidth = this.calculateDistance(landmarks[1], landmarks[17]);
        const handOrientation = this.calculateOrientation(landmarks[0], landmarks[9]);
        const handOrientationDegrees = handOrientation * (180 / Math.PI);

        this.wristWidth = wristWidth;
        this.handOrientationRadians = handOrientation;
        this.handOrientationDegrees = handOrientationDegrees;

        this.processWorldLandmarks(this.results.worldLandmarks[0]);

        // Calculate the hand position
        this.calculateHandPosition();

        this.changeDetectorRef.detectChanges();

      } else {

        this.wristWidth = 0;
        this.handOrientationRadians = 0;
        this.handOrientationDegrees = 0;

        this.changeDetectorRef.detectChanges();

      }

    }
  }

  lastVideoTime = -1;
  results?: HandLandmarkerResult = undefined;
  poseResult?: PoseLandmarkerResult = undefined;

  // Function to calculate distance between two landmarks
  calculateDistance(landmark1: NormalizedLandmark, landmark2: NormalizedLandmark): number {
    return Math.sqrt(
      Math.pow(landmark2.x - landmark1.x, 2) +
      Math.pow(landmark2.y - landmark1.y, 2) +
      Math.pow(landmark2.z - landmark1.z, 2)
    );
  }

  // Function to calculate orientation angle in radians
  calculateOrientation(landmark1: NormalizedLandmark, landmark2: NormalizedLandmark): number {
    const dx = landmark2.x - landmark1.x;
    const dy = landmark2.y - landmark1.y;
    const angle = Math.atan2(dy, dx);
    return angle;
  }

  // Function to calculate a vector between two landmarks
  vectorBetween(landmark1: WorldLandmark, landmark2: WorldLandmark): WorldLandmark {
    return {
      x: landmark2.x - landmark1.x,
      y: landmark2.y - landmark1.y,
      z: landmark2.z - landmark1.z,
    };
  }

  normalize(vector: WorldLandmark): WorldLandmark {
    const length = Math.sqrt(vector.x ** 2 + vector.y ** 2 + vector.z ** 2);
    return {
      // x: Math.round((vector.x / length) * 1000) / 1000,
      // y: Math.round((vector.y / length) * 1000) / 1000,
      // z: Math.round((vector.z / length) * 1000) / 1000,
      x: vector.x / length,
      y: vector.y / length,
      z: vector.z / length,
    };
  }

  processWorldLandmarks(worldLandmarks: WorldLandmark[]): void {
    if (worldLandmarks.length > 0) {


      const forwardVector = this.vectorBetween(worldLandmarks[0], worldLandmarks[9]);
      const normalizedForwardVector = this.normalize(forwardVector);

      let upVector = this.normalize(this.vectorBetween(worldLandmarks[0], worldLandmarks[5]));

      let rightVector = this.normalize(this.vectorBetween(worldLandmarks[0], worldLandmarks[17]));

      this.handVector = normalizedForwardVector;
      this.upVector = upVector;
      this.rightVector = rightVector;

      this.changeDetectorRef.detectChanges();

      this.updateModelOrientation();
      this.updateModelScale();
    }
  }

  calculateHandPosition() { 
    // Assuming `wristLandmark` is the wrist landmark from MediaPipe's HandLandmarker
    // and `camera` is your Three.js PerspectiveCamera

    // Example wrist landmark from MediaPipe
    const wristLandmark = this.results?.landmarks[0][0]; // Landmark 0 is usually the wrist

    if (!wristLandmark) {
      return; // Make sure the wrist landmark is available
    }

    // Convert normalized coordinates to screen space (assuming fullscreen canvas)
    const xScreen = wristLandmark.x * window.innerWidth;
    const yScreen = wristLandmark.y * window.innerHeight

    // Convert screen space to Three.js world space
    const vector = new THREE.Vector3(
      (xScreen / window.innerWidth) * 2 - 1,
      -(yScreen / window.innerHeight) * 2 + 1,
      0.5
    );

    vector.unproject(this.camera!); // Unproject to get the position in world space

    // Assuming `watchModel` is your Three.js Object3D for the watch
    // Set the model's position to the wrist's world space position
    this.watchModel!.position.set(vector.x, vector.y, vector.z);

    // Adjust Z position based on your scene setup or camera distance
    // You might need to manually adjust this based on the depth of your scene and the size of the watch model
    // this.watchModel!.position.z = -5;

  }

}
