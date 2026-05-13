/**
 * Opens and immediately closes a mic capture session so the browser audio
 * pipeline is ready before Web Speech API's SpeechRecognition.start().
 * Without this, Chromium often drops the first phrase after the user clicks record.
 */
export async function warmUpMicrophoneForSpeech(signal?: AbortSignal): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return;
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, signal });
  for (const track of stream.getTracks()) {
    track.stop();
  }
}
