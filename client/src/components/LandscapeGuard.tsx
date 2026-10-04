import { useEffect, useState, type ReactNode } from "react";

interface LandscapeGuardProps {
  active: boolean;
  children: ReactNode;
}

function isTouchDevice() {
  return navigator.maxTouchPoints > 0 || window.matchMedia("(pointer: coarse)").matches;
}

export default function LandscapeGuard({ active, children }: LandscapeGuardProps) {
  const [shouldRotate, setShouldRotate] = useState(false);

  useEffect(() => {
    if (!active) {
      setShouldRotate(false);
      return;
    }

    const updateOrientation = () => {
      setShouldRotate(isTouchDevice() && window.innerHeight > window.innerWidth);
    };

    updateOrientation();
    window.addEventListener("resize", updateOrientation);
    window.addEventListener("orientationchange", updateOrientation);

    // Browsers only honor this in supported contexts, usually after fullscreen/user gesture.
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (orientation: "landscape") => Promise<void>;
    };
    if (isTouchDevice() && orientation.lock) {
      orientation.lock("landscape").catch(() => {
        // Showing the rotate prompt is the fallback when orientation locking is unavailable.
      });
    }

    return () => {
      window.removeEventListener("resize", updateOrientation);
      window.removeEventListener("orientationchange", updateOrientation);
    };
  }, [active]);

  return (
    <>
      {children}
      {active && shouldRotate && (
        <div className="landscape-guard" role="dialog" aria-modal="true" aria-label="Rotate your device">
          <div className="landscape-guard__card">
            <div className="landscape-guard__icon" aria-hidden="true">↻</div>
            <h2>ROTATE YOUR SCREEN</h2>
            <p>Please rotate your phone or tablet to landscape/horizontal mode to play Rushout.</p>
          </div>
        </div>
      )}
    </>
  );
}
