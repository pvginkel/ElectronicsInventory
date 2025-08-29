import { useState, useEffect } from 'react';

export function useCameraDetection() {
  const [hasCamera, setHasCamera] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    let mounted = true;

    const checkCameraAvailability = async () => {
      try {
        // Check if the browser supports getUserMedia
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          if (mounted) {
            setHasCamera(false);
            setIsChecking(false);
          }
          return;
        }

        // Try to enumerate devices
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        
        if (mounted) {
          setHasCamera(videoDevices.length > 0);
          setIsChecking(false);
        }
      } catch (error) {
        console.warn('Camera detection failed:', error);
        if (mounted) {
          setHasCamera(false);
          setIsChecking(false);
        }
      }
    };

    checkCameraAvailability();

    return () => {
      mounted = false;
    };
  }, []);

  return { hasCamera, isChecking };
}