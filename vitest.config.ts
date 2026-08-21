import { defineConfig } from 'vitest/config';

// Celowo vitest 3, nie 4: dwa landingi (2W, On the Wall) stoją na trójce, więc
// zestaw kontraktowy musi się mieścić w jej API. Gdyby paczka testowała się
// czwórką, dałoby się tu użyć czegoś, co u klienta nie zadziała.
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
