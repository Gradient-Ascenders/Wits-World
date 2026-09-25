import { useEffect, useRef, type PointerEventHandler } from 'react';

export function useCardTilt<ElementType extends HTMLElement>() {
  const elementRef = useRef<ElementType>(null);
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
        Math.abs(state.velocityX) +
        Math.abs(state.velocityY) +
        Math.abs(state.velocityScale) * 10 +
        Math.abs(state.velocityZ);

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
    return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  };

  const handlePointerEnter: PointerEventHandler<ElementType> = (event) => {
    if (!canTilt(event.pointerType)) return;
    spring.current.targetScale = 1.055;
    spring.current.targetZ = 1.35;
    elementRef.current?.setAttribute('data-hovered', '');
    startSpring();
  };

  const handlePointerMove: PointerEventHandler<ElementType> = (event) => {
    if (!canTilt(event.pointerType)) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const horizontal = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
    const vertical = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;

    spring.current.targetX = vertical * -10;
    spring.current.targetY = horizontal * 12;
    spring.current.targetScale = 1.055;
    spring.current.targetZ = 1.35;
    startSpring();
  };

  const settleCard = () => {
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
