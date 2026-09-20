"use client";

import { type HTMLMotionProps, motion } from "motion/react";
import { Slot, type WithAsChild } from "@/components/animate-ui/primitives/animate/slot";

type ButtonProps = WithAsChild<
  HTMLMotionProps<"button"> & {
    hoverScale?: number;
    tapScale?: number;
  }
>;

function Button({ hoverScale = 1.05, tapScale = 0.95, asChild = false, ...props }: ButtonProps) {
  if (asChild) {
    return <Slot whileTap={{ scale: tapScale }} whileHover={{ scale: hoverScale }} {...props} />;
  }

  return (
    <motion.button whileTap={{ scale: tapScale }} whileHover={{ scale: hoverScale }} {...props} />
  );
}

export { Button, type ButtonProps };
