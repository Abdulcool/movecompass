export function cameraGuidance(error: unknown) {
  const text = error && typeof error==='object' ? `${'name' in error ? error.name : ''} ${'message' in error ? error.message : ''}` : String(error||'');
  if(/notallowed|permission|denied/i.test(text))return 'Camera access is off. Allow camera access in your browser or device settings, then try again. You can also complete this set manually.';
  if(/notfound|devicesnotfound|no camera|device not found/i.test(text))return 'No camera was found. Connect a camera or use a phone with a camera, then try again. You can also complete this set manually.';
  if(/notreadable|trackstarterror|in use/i.test(text))return 'Another app may be using the camera. Close it and try again, or complete this set manually.';
  if(/https|secure context/i.test(text))return 'Camera access needs a secure HTTPS connection. Open the secure app address or complete this set manually.';
  return 'The camera could not start. Check your camera and connection, then try again. You can also complete this set manually.';
}
