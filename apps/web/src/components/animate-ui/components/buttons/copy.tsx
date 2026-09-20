"use client";

import { IconCheck, IconCopy } from "@tabler/icons-react";
import { cva, type VariantProps } from "class-variance-authority";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";
import {
  Button as ButtonPrimitive,
  type ButtonProps as ButtonPrimitiveProps,
} from "@/components/animate-ui/primitives/buttons/button";
import { useControlledState } from "@/hooks/use-controlled-state";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md font-medium text-sm outline-none transition-[box-shadow,_color,_background-color,_border-color,_outline-color,_text-decoration-color,_fill,_stroke] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        accent: "bg-accent text-accent-foreground shadow-xs hover:bg-accent/90",
        destructive:
          "bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary: "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "size-9",
        xs: "size-7 rounded-md [&_svg:not([class*='size-'])]:size-3.5",
        sm: "size-8 rounded-md",
        lg: "size-10 rounded-md",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type CopyButtonProps = Omit<ButtonPrimitiveProps, "children"> &
  VariantProps<typeof buttonVariants> & {
    content: string;
    copied?: boolean;
    onCopiedChange?: (copied: boolean, content?: string) => void;
    delay?: number;
    children?: React.ReactNode;
  };

function CopyButton({
  className,
  content,
  copied,
  onCopiedChange,
  onClick,
  variant,
  size,
  delay = 3000,
  hoverScale = 1.05,
  tapScale = 0.95,
  children,
  type = "button",
  ...props
}: CopyButtonProps) {
  const [isCopied, setIsCopied] = useControlledState<boolean, [content?: string]>({
    value: copied,
    defaultValue: false,
    onChange: onCopiedChange,
  });

  const handleCopy = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(e);
      if (isCopied) return;
      if (content && typeof navigator !== "undefined" && navigator.clipboard) {
        navigator.clipboard
          .writeText(content)
          .then(() => {
            setIsCopied(true, content);
            setTimeout(() => {
              setIsCopied(false);
            }, delay);
          })
          .catch((error) => {
            console.error("Error copying content:", error);
          });
      }
    },
    [onClick, isCopied, content, setIsCopied, delay],
  );

  const Icon = isCopied ? IconCheck : IconCopy;

  return (
    <ButtonPrimitive
      type={type}
      data-slot="copy-button"
      hoverScale={hoverScale}
      tapScale={tapScale}
      className={cn(buttonVariants({ variant, size, className }), children && "w-auto gap-2 px-3")}
      onClick={handleCopy}
      aria-label={props["aria-label"] ?? (isCopied ? "Copiado" : "Copiar")}
      {...props}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={isCopied ? "check" : "copy"}
          data-slot="copy-button-icon"
          initial={{ scale: 0, opacity: 0.4, filter: "blur(4px)" }}
          animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
          exit={{ scale: 0, opacity: 0.4, filter: "blur(4px)" }}
          transition={{ duration: 0.25 }}
          className="inline-flex items-center justify-center"
        >
          <Icon className="size-4" />
        </motion.span>
      </AnimatePresence>
      {children && <span>{children}</span>}
    </ButtonPrimitive>
  );
}

export { buttonVariants, CopyButton, type CopyButtonProps };
