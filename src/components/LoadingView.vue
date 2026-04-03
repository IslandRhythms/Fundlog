<script setup lang="ts">
withDefaults(
  defineProps<{
    message?: string;
    compact?: boolean;
  }>(),
  { compact: false },
);
</script>

<template>
  <div
    class="fundlog-loading-root"
    :class="{ 'fundlog-loading-root--compact': compact }"
  >
    <div class="wallet-loader">
      <div class="wallet-back"></div>
      <div class="bill bill-1"></div>
      <div class="bill bill-2"></div>
      <div class="bill bill-3"></div>
      <div class="wallet-front">
        <div class="text">
          Loading<span class="dot">.</span><span class="dot">.</span
          ><span class="dot">.</span>
        </div>
      </div>
    </div>
    <p v-if="message" class="fundlog-loading-message">{{ message }}</p>
  </div>
</template>

<style scoped>
.wallet-loader {
  --duration: 4s;

  position: relative;
  width: 110px;
  height: 80px;
}

.wallet-loader .wallet-back {
  position: absolute;
  bottom: 10px;
  left: 5px;
  width: 100px;
  height: 45px;
  background: var(--loading-wallet-back-surface);
  border-radius: 5px 5px 0 0;
  z-index: 0;
}

.wallet-loader .bill {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: -30px;
  width: 70px;
  height: 40px;
  background: var(--loading-bill-surface);
  border-radius: 2px;
  border: 1px solid var(--loading-bill-ink);
  opacity: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.wallet-loader .bill::before {
  content: 'F';
  font-family: sans-serif;
  font-weight: bold;
  font-size: 18px;
  color: var(--loading-bill-ink);
  border: 2px solid var(--loading-bill-ink);
  border-radius: 50%;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--loading-bill-shine);
}

.wallet-loader .bill::after {
  content: '';
  position: absolute;
  left: 3px;
  right: 3px;
  top: 3px;
  bottom: 3px;
  border: 1px dashed var(--loading-bill-ink);
  border-radius: 1px;
}

.wallet-loader .bill-1 {
  z-index: 1;
  animation: slide-in var(--duration) ease-in-out infinite;
  animation-delay: 0s;
}

.wallet-loader .bill-2 {
  z-index: 2;
  animation: slide-in var(--duration) ease-in-out infinite;
  animation-delay: 0.8s;
}

.wallet-loader .bill-3 {
  z-index: 3;
  animation: slide-in var(--duration) ease-in-out infinite;
  animation-delay: 1.6s;
}

.wallet-loader .wallet-front {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 110px;
  height: 52px;
  background: linear-gradient(
    180deg,
    var(--loading-wallet-front-top),
    var(--loading-wallet-front-bottom)
  );
  border-radius: 6px 6px 10px 10px;
  z-index: 10;
  box-shadow: var(--loading-wallet-elev);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: wallet-bounce var(--duration) ease-in-out infinite;
}

.wallet-loader .wallet-front::before {
  content: '';
  position: absolute;
  left: 6px;
  right: 6px;
  bottom: 6px;
  top: 6px;
  border: 1px dashed var(--loading-wallet-stitch);
  border-radius: 4px 4px 8px 8px;
  pointer-events: none;
}

.wallet-loader .text {
  font-family:
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    Roboto,
    Helvetica,
    Arial,
    sans-serif;
  font-size: 14px;
  font-weight: 600;
  color: var(--loading-wallet-text);
  letter-spacing: 0.5px;
  text-shadow: var(--loading-text-shadow);
}

.wallet-loader .dot {
  display: inline-block;
  animation: wave 1.5s infinite;
}

.wallet-loader .dot:nth-child(1) {
  animation-delay: 0s;
}

.wallet-loader .dot:nth-child(2) {
  animation-delay: 0.1s;
}

.wallet-loader .dot:nth-child(3) {
  animation-delay: 0.2s;
}

@keyframes slide-in {
  0% {
    top: -30px;
    opacity: 0;
    transform: translateX(-50%) scale(0.8);
  }

  10% {
    opacity: 1;
  }

  25% {
    top: 18px;
    transform: translateX(-50%) scale(1);
  }

  90% {
    top: 18px;
    opacity: 1;
  }

  100% {
    top: 18px;
    opacity: 0;
  }
}

@keyframes wallet-bounce {
  0%,
  100% {
    transform: scale(1);
  }

  12% {
    transform: scale(1.02, 0.98);
  }

  15% {
    transform: scale(1);
  }

  32% {
    transform: scale(1.02, 0.98);
  }

  35% {
    transform: scale(1);
  }

  52% {
    transform: scale(1.02, 0.98);
  }

  55% {
    transform: scale(1);
  }
}

@keyframes wave {
  0%,
  60%,
  100% {
    transform: translateY(0);
  }

  30% {
    transform: translateY(-4px);
  }
}

.fundlog-loading-root {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 0.5rem 0;
  min-height: 9rem;
}

.fundlog-loading-root--compact {
  min-height: auto;
  gap: 0.75rem;
  padding: 0.25rem 0;
}
</style>
