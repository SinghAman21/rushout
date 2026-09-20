import type { PointerEvent } from "react";

export type JoystickDirection = -1 | 0 | 1;

interface TouchJoystickProps {
  direction: JoystickDirection;
  onDirectionChange: (direction: JoystickDirection) => void;
  className?: string;
  ariaLabel?: string;
  deadZonePx?: number;
  thumbOffsetPx?: number;
}

export default function TouchJoystick({
  direction,
  onDirectionChange,
  className = "",
  ariaLabel = "Move left or right",
  deadZonePx = 12,
  thumbOffsetPx = 26,
}: TouchJoystickProps) {
  const updateDirection = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const offset = event.clientX - (bounds.left + bounds.width / 2);
    const nextDirection: JoystickDirection = offset < -deadZonePx ? -1 : offset > deadZonePx ? 1 : 0;
    onDirectionChange(nextDirection);
  };

  const releaseDirection = () => {
    onDirectionChange(0);
  };

  return (
    <div
      className={`touch-joystick ${className}`.trim()}
      role="slider"
      aria-label={ariaLabel}
      aria-valuemin={-1}
      aria-valuemax={1}
      aria-valuenow={direction}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        updateDirection(event);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          updateDirection(event);
        }
      }}
      onPointerUp={releaseDirection}
      onPointerCancel={releaseDirection}
      onLostPointerCapture={releaseDirection}
    >
      <span className="touch-joystick__arrow touch-joystick__arrow--left" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M15.5 5.5 9 12l6.5 6.5" />
        </svg>
      </span>
      <span
        className="touch-joystick__thumb"
        style={{ transform: `translate(calc(-50% + ${direction * thumbOffsetPx}px), -50%)` }}
        aria-hidden="true"
      />
      <span className="touch-joystick__arrow touch-joystick__arrow--right" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="m8.5 5.5 6.5 6.5-6.5 6.5" />
        </svg>
      </span>
    </div>
  );
}
