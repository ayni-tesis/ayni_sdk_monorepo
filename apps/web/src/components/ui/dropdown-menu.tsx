"use client";

import { IconCheck, IconChevronRight } from "@tabler/icons-react";
import * as React from "react";

import {
  DropdownMenu as DropdownMenuPrimitive,
  DropdownMenuCheckboxItem as DropdownMenuCheckboxItemPrimitive,
  type DropdownMenuCheckboxItemProps as DropdownMenuCheckboxItemPrimitiveProps,
  DropdownMenuContent as DropdownMenuContentPrimitive,
  type DropdownMenuContentProps as DropdownMenuContentPrimitiveProps,
  DropdownMenuGroup as DropdownMenuGroupPrimitive,
  DropdownMenuItem as DropdownMenuItemPrimitive,
  DropdownMenuItemIndicator as DropdownMenuItemIndicatorPrimitive,
  type DropdownMenuItemProps as DropdownMenuItemPrimitiveProps,
  DropdownMenuLabel as DropdownMenuLabelPrimitive,
  type DropdownMenuLabelProps as DropdownMenuLabelPrimitiveProps,
  DropdownMenuPortal as DropdownMenuPortalPrimitive,
  DropdownMenuRadioGroup as DropdownMenuRadioGroupPrimitive,
  DropdownMenuRadioItem as DropdownMenuRadioItemPrimitive,
  type DropdownMenuRadioItemProps as DropdownMenuRadioItemPrimitiveProps,
  DropdownMenuSeparator as DropdownMenuSeparatorPrimitive,
  type DropdownMenuSeparatorProps as DropdownMenuSeparatorPrimitiveProps,
  DropdownMenuShortcut as DropdownMenuShortcutPrimitive,
  DropdownMenuSub as DropdownMenuSubPrimitive,
  DropdownMenuSubContent as DropdownMenuSubContentPrimitive,
  type DropdownMenuSubContentProps as DropdownMenuSubContentPrimitiveProps,
  DropdownMenuSubTrigger as DropdownMenuSubTriggerPrimitive,
  type DropdownMenuSubTriggerProps as DropdownMenuSubTriggerPrimitiveProps,
  DropdownMenuTrigger as DropdownMenuTriggerPrimitive,
  type DropdownMenuTriggerProps as DropdownMenuTriggerPrimitiveProps,
  useDropdownMenu,
} from "@/components/animate-ui/primitives/radix/dropdown-menu";
import { cn } from "@/lib/utils";

function DropdownMenu(props: React.ComponentProps<typeof DropdownMenuPrimitive>) {
  return <DropdownMenuPrimitive {...props} />;
}

type DropdownMenuTriggerProps = DropdownMenuTriggerPrimitiveProps & {
  render?: React.ReactNode;
};

function DropdownMenuTrigger({
  render,
  children,
  asChild,
  onClick,
  ...props
}: DropdownMenuTriggerProps) {
  const { isOpen, setIsOpen } = useDropdownMenu();

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    setIsOpen(!isOpen);
    onClick?.(e);
  };

  if (render && React.isValidElement(render)) {
    return (
      <DropdownMenuTriggerPrimitive asChild onClick={handleClick} {...props}>
        {React.cloneElement(render as React.ReactElement<{ children?: React.ReactNode }>, {
          children: (render.props as { children?: React.ReactNode }).children ?? children,
        })}
      </DropdownMenuTriggerPrimitive>
    );
  }

  return (
    <DropdownMenuTriggerPrimitive asChild={asChild} onClick={handleClick} {...props}>
      {children}
    </DropdownMenuTriggerPrimitive>
  );
}

function DropdownMenuPortal(props: React.ComponentProps<typeof DropdownMenuPortalPrimitive>) {
  return <DropdownMenuPortalPrimitive {...props} />;
}

type DropdownMenuContentProps = DropdownMenuContentPrimitiveProps;

function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: DropdownMenuContentProps) {
  return (
    <DropdownMenuContentPrimitive
      sideOffset={sideOffset}
      className={cn(
        "z-50 min-w-32 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-none",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuGroup(props: React.ComponentProps<typeof DropdownMenuGroupPrimitive>) {
  return <DropdownMenuGroupPrimitive {...props} />;
}

type DropdownMenuItemProps = DropdownMenuItemPrimitiveProps;

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  onClick,
  onSelect,
  ...props
}: DropdownMenuItemProps) {
  const { setIsOpen } = useDropdownMenu();

  return (
    <DropdownMenuItemPrimitive
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "group/dropdown-menu-item relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-hidden focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0 data-[variant=destructive]:*:[svg]:text-destructive",
        className,
      )}
      onClick={(e) => {
        setIsOpen(false);
        onClick?.(e);
      }}
      onSelect={(e) => {
        setIsOpen(false);
        onSelect?.(e);
      }}
      {...props}
    />
  );
}

type DropdownMenuCheckboxItemProps = DropdownMenuCheckboxItemPrimitiveProps;

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  ...props
}: DropdownMenuCheckboxItemProps) {
  return (
    <DropdownMenuCheckboxItemPrimitive
      checked={checked}
      className={cn(
        "relative flex cursor-default select-none items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-xs outline-hidden focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 flex size-3.5 items-center justify-center">
        <DropdownMenuItemIndicatorPrimitive>
          <IconCheck className="size-4" />
        </DropdownMenuItemIndicatorPrimitive>
      </span>
      {children}
    </DropdownMenuCheckboxItemPrimitive>
  );
}

function DropdownMenuRadioGroup(
  props: React.ComponentProps<typeof DropdownMenuRadioGroupPrimitive>,
) {
  return <DropdownMenuRadioGroupPrimitive {...props} />;
}

type DropdownMenuRadioItemProps = DropdownMenuRadioItemPrimitiveProps;

function DropdownMenuRadioItem({ className, children, ...props }: DropdownMenuRadioItemProps) {
  return (
    <DropdownMenuRadioItemPrimitive
      className={cn(
        "relative flex cursor-default select-none items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-xs outline-hidden focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 flex size-3.5 items-center justify-center">
        <DropdownMenuItemIndicatorPrimitive>
          <IconCheck className="size-4" />
        </DropdownMenuItemIndicatorPrimitive>
      </span>
      {children}
    </DropdownMenuRadioItemPrimitive>
  );
}

type DropdownMenuLabelProps = DropdownMenuLabelPrimitiveProps;

function DropdownMenuLabel({ className, inset, ...props }: DropdownMenuLabelProps) {
  return (
    <DropdownMenuLabelPrimitive
      data-inset={inset}
      className={cn("px-2 py-1.5 font-semibold text-muted-foreground text-xs data-[inset]:pl-8", className)}
      {...props}
    />
  );
}

type DropdownMenuSeparatorProps = DropdownMenuSeparatorPrimitiveProps;

function DropdownMenuSeparator({ className, ...props }: DropdownMenuSeparatorProps) {
  return (
    <DropdownMenuSeparatorPrimitive
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}

function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuShortcutPrimitive>) {
  return (
    <DropdownMenuShortcutPrimitive
      className={cn("ml-auto text-muted-foreground text-xs tracking-widest", className)}
      {...props}
    />
  );
}

function DropdownMenuSub(props: React.ComponentProps<typeof DropdownMenuSubPrimitive>) {
  return <DropdownMenuSubPrimitive {...props} />;
}

type DropdownMenuSubTriggerProps = DropdownMenuSubTriggerPrimitiveProps;

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: DropdownMenuSubTriggerProps) {
  return (
    <DropdownMenuSubTriggerPrimitive
      data-inset={inset}
      className={cn(
        "flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-hidden focus:bg-accent focus:text-accent-foreground data-[inset]:pl-8 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      {children}
      <IconChevronRight className="ml-auto size-4" />
    </DropdownMenuSubTriggerPrimitive>
  );
}

type DropdownMenuSubContentProps = DropdownMenuSubContentPrimitiveProps;

function DropdownMenuSubContent({ className, ...props }: DropdownMenuSubContentProps) {
  return (
    <DropdownMenuSubContentPrimitive
      className={cn(
        "z-50 min-w-32 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg",
        className,
      )}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
};
