import type { Transition, Variants } from "framer-motion";

export const smoothEase = [0.22, 1, 0.36, 1] as const;
export const quickEase = [0.4, 0, 0.2, 1] as const;

export const routeTransition: Transition = {
  duration: 0.16,
  ease: [0.4, 0, 0.2, 1],
};

export const routeExitTransition: Transition = {
  duration: 0.08,
  ease: [0.4, 0, 0.2, 1],
};

export const routeTransitionVariants: Variants = {
  initial: {
    opacity: 0,
  },
  enter: {
    opacity: 1,
    transition: routeTransition,
  },
  exit: {
    opacity: 0,
    transition: routeExitTransition,
  },
};

export const pageStaggerVariants: Variants = {
  hidden: {
    opacity: 1,
  },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.03,
    },
  },
};

export const pageItemVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 12,
  },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.34,
      ease: smoothEase,
    },
  },
};
