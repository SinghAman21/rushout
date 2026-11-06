import React from "react";
import { Button } from "./ui/button.js";

export type ArcadeButtonColor = "yellow" | "green" | "red" | "blue" | "purple" | "secondary";

interface ArcadeButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  color?: ArcadeButtonColor;
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export default function ArcadeButton({
  color = "yellow",
  size = "md",
  fullWidth = false,
  icon,
  children,
  className = "",
  style,
  ...props
}: ArcadeButtonProps) {
  const sizeStyles: Record<string, React.CSSProperties> = {
    sm: { padding: "0.55rem 1rem", fontSize: "0.95rem", borderRadius: "12px" },
    md: { padding: "0.85rem 1.6rem", fontSize: "1.15rem", borderRadius: "16px" },
    lg: { padding: "1.1rem 2.2rem", fontSize: "1.35rem", borderRadius: "20px" },
  };

  return (
    <Button
      className={`arcade-btn arcade-btn-${color} ${className}`}
      style={{
        ...sizeStyles[size],
        width: fullWidth ? "100%" : undefined,
        ...style,
      }}
      {...props}
    >
      {icon && <span style={{ display: "inline-flex", fontSize: "1.2em", lineHeight: 1 }}>{icon}</span>}
      <span>{children}</span>
    </Button>
  );
}
