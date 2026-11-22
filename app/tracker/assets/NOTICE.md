# Third-party model and runtime

The full float16 pose landmark model is distributed by Google through MediaPipe:
https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task

MediaPipe code and model resources are available under the Apache License 2.0.
See LICENSE.apache-2.0.txt and https://github.com/google-ai-edge/mediapipe .
The build also copies runtime WASM/JavaScript from @mediapipe/tasks-vision,
Copyright Google LLC, Apache-2.0, whose exact version is pinned in package-lock.json.
