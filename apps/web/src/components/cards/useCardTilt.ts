import { useEffect, useRef, type PointerEventHandler } from 'react';

import { prefersReducedMotion } from '../../accessibility/preferences';

export type CardTiltMotion = 'spring' | 'smooth';

export function advanceSmoothTilt(
  current: number,
  velocity: number,
  target: number,
  seconds: number,
) {
  const frequency = 24;
  const decay = Math.exp(-frequency * seconds);
  const offset = current - target;
  const momentum = velocity + frequency * offset;
  return {
    current: target + (offset + momentum * seconds) * decay,
    velocity: (velocity - frequency * momentum * seconds) * decay,
  };
}

const tiltAxes = [
  ['currentX', 'velocityX', 'targetX'],
  ['currentY', 'velocityY', 'targetY'],
  ['currentScale', 'velocityScale', 'targetScale'],
  ['currentZ', 'velocityZ', 'targetZ'],
] as const;

export function useCardTilt<ElementType extends HTMLElement>(
  motion: CardTiltMotion = 'spring',
) {
  const elementRef = useRef<ElementType>(null);
  const pointerBounds = useRef<DOMRect | null>(null);
  const animationFrame = useRef(0);
  const spring = useRef({
    currentScale: 1,
    currentX: 0,
    currentY: 0,
    currentZ: 0,
    lastTime: 0,
    targetScale: 1,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
    velocityScale: 0,
    velocityX: 0,
    velocityY: 0,
    velocityZ: 0,
  });

  useEffect(
    () => () => {
      window.cancelAnimationFrame(animationFrame.current);
    },
    [],
  );

  const startSpring = () => {
    if (animationFrame.current) return;
    if (motion === 'smooth' && spring.current.lastTime === 0) {
      spring.current.lastTime = performance.now();
    }

    const animate = (time: number) => {
      const element = elementRef.current;
      if (!element) {
        animationFrame.current = 0;
        return;
      }

      const state = spring.current;
      const delta = state.lastTime
        ? Math.min((time - state.lastTime) / (1000 / 60), 2)
        : 1;
      state.lastTime = time;

      if (motion === 'smooth') {
        // Exact critically damped integration preserves velocity when the
        // pointer changes direction and behaves consistently across frame rates.
        const seconds = delta / 60;
        for (const [current, velocity, target] of tiltAxes) {
          const next = advanceSmoothTilt(
            state[current],
            state[velocity],
            state[target],
            seconds,
          );
          state[current] = next.current;
          state[velocity] = next.velocity;
        }
      } else {
        const stiffness = 0.12 * delta;
        const damping = Math.pow(0.72, delta);

        state.velocityX =
          (state.velocityX + (state.targetX - state.currentX) * stiffness) *
          damping;
        state.velocityY =
          (state.velocityY + (state.targetY - state.currentY) * stiffness) *
          damping;
        state.velocityScale =
          (state.velocityScale +
            (state.targetScale - state.currentScale) * stiffness) *
          damping;
        state.velocityZ =
          (state.velocityZ + (state.targetZ - state.currentZ) * stiffness) *
          damping;

        state.currentX += state.velocityX * delta;
        state.currentY += state.velocityY * delta;
        state.currentScale += state.velocityScale * delta;
        state.currentZ += state.velocityZ * delta;
      }

      element.style.setProperty(
        '--card-tilt-x',
        `${state.currentX.toFixed(3)}deg`,
      );
      element.style.setProperty(
        '--card-tilt-y',
        `${state.currentY.toFixed(3)}deg`,
      );
      element.style.setProperty('--card-scale', state.currentScale.toFixed(4));
      element.style.setProperty('--card-z', `${state.currentZ.toFixed(3)}rem`);

      const distance =
        Math.abs(state.targetX - state.currentX) +
        Math.abs(state.targetY - state.currentY) +
        Math.abs(state.targetScale - state.currentScale) * 10 +
        Math.abs(state.targetZ - state.currentZ);
      const velocity =
        (Math.abs(state.velocityX) +
          Math.abs(state.velocityY) +
          Math.abs(state.velocityScale) * 10 +
          Math.abs(state.velocityZ)) /
        (motion === 'smooth' ? 60 : 1);

      if (distance > 0.012 || velocity > 0.012) {
        animationFrame.current = window.requestAnimationFrame(animate);
        return;
      }

      state.currentX = state.targetX;
      state.currentY = state.targetY;
      state.currentScale = state.targetScale;
      state.currentZ = state.targetZ;
      state.lastTime = 0;
      element.style.setProperty('--card-tilt-x', `${state.targetX}deg`);
      element.style.setProperty('--card-tilt-y', `${state.targetY}deg`);
      element.style.setProperty('--card-scale', String(state.targetScale));
      element.style.setProperty('--card-z', `${state.targetZ}rem`);
      element.removeAttribute('data-tilting');
      animationFrame.current = 0;
    };

    elementRef.current?.setAttribute('data-tilting', '');
    animationFrame.current = window.requestAnimationFrame(animate);
  };

  const canTilt = (pointerType: string) => {
    if (pointerType === 'touch') return false;
    return !prefersReducedMotion();
  };

  const handlePointerEnter: PointerEventHandler<ElementType> = (event) => {
    if (!canTilt(event.pointerType)) return;
    if (motion === 'smooth') {
      pointerBounds.current = event.currentTarget.getBoundingClientRect();
    }
    spring.current.targetScale = 1.055;
    spring.current.targetZ = 1.35;
    elementRef.current?.setAttribute('data-hovered', '');
    startSpring();
  };

  const handlePointerMove: PointerEventHandler<ElementType> = (event) => {
    if (!canTilt(event.pointerType)) return;
    const bounds =
      motion === 'smooth'
        ? (pointerBounds.current ?? event.currentTarget.getBoundingClientRect())
        : event.currentTarget.getBoundingClientRect();
    const horizontal = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
    const vertical = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
    const boundedHorizontal =
      motion === 'smooth' ? Math.max(-1, Math.min(1, horizontal)) : horizontal;
    const boundedVertical =
      motion === 'smooth' ? Math.max(-1, Math.min(1, vertical)) : vertical;

    spring.current.targetX = boundedVertical * -10;
    spring.current.targetY = boundedHorizontal * 12;
    spring.current.targetScale = 1.055;
    spring.current.targetZ = 1.35;
    startSpring();
  };

  const settleCard = () => {
    pointerBounds.current = null;
    spring.current.targetX = 0;
    spring.current.targetY = 0;
    spring.current.targetScale = 1;
    spring.current.targetZ = 0;
    elementRef.current?.removeAttribute('data-hovered');
    startSpring();
  };

  return {
    onPointerCancel: settleCard,
    onPointerEnter: handlePointerEnter,
    onPointerLeave: settleCard,
    onPointerMove: handlePointerMove,
    ref: elementRef,
  };
}
