import { expect, test } from '@playwright/test';
import { MILKY_WAY_FRAGMENT, MILKY_WAY_VERTEX } from '../../src/renderer/milkyWay';

test('the procedural Milky Way shaders compile and paint light in real WebGL', async ({ page }) => {
  await page.goto('/?scenario=milkyway');
  const result = await page.evaluate(
    ({ vertex, fragment }) => {
      const canvas = document.createElement('canvas');
      canvas.width = 80;
      canvas.height = 80;
      const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
      if (!gl) return { error: 'WebGL context unavailable', glError: -1, full: 0, low: 0, hidden: 0 };
      const compile = (kind: number, source: string) => {
        const shader = gl.createShader(kind)!;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw new Error(gl.getShaderInfoLog(shader) || 'Milky Way shader failed to compile');
        return shader;
      };
      const vertexSource = [
        'attribute vec3 position;',
        'uniform mat4 modelMatrix;',
        'uniform mat4 viewMatrix;',
        'uniform mat4 projectionMatrix;',
        vertex,
      ].join('\n');
      const program = gl.createProgram()!;
      gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error(gl.getProgramInfoLog(program) || 'Milky Way program failed to link');
      gl.useProgram(program);
      const buffer = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      // Directions near the galactic center, transformed above the horizon.
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-0.4, -0.5, -0.48, 0.3, -0.5, -0.48, -0.05, -0.95, -0.48]),
        gl.STATIC_DRAW,
      );
      const position = gl.getAttribLocation(program, 'position');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0);
      const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
      const aboveHorizon = new Float32Array([1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
      gl.uniformMatrix4fv(gl.getUniformLocation(program, 'modelMatrix'), false, aboveHorizon);
      gl.uniformMatrix4fv(gl.getUniformLocation(program, 'viewMatrix'), false, identity);
      gl.uniformMatrix4fv(gl.getUniformLocation(program, 'projectionMatrix'), false, identity);
      const draw = (octaves: number, intensity: number) => {
        gl.uniform1f(gl.getUniformLocation(program, 'uOctaves'), octaves);
        gl.uniform1f(gl.getUniformLocation(program, 'uIntensity'), intensity);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        const pixels = new Uint8Array(canvas.width * canvas.height * 4);
        gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        let light = 0;
        for (let i = 0; i < pixels.length; i += 4)
          light += pixels[i] + pixels[i + 1] + pixels[i + 2];
        return light;
      };
      const full = draw(5, 1);
      const low = draw(3, 1);
      const hidden = draw(5, 0);
      return { error: '', glError: gl.getError(), full, low, hidden };
    },
    { vertex: MILKY_WAY_VERTEX, fragment: MILKY_WAY_FRAGMENT },
  );
  expect(result.error).toBe('');
  expect(result.glError).toBe(0);
  expect(result.full).toBeGreaterThan(0);
  expect(result.low).toBeGreaterThan(0);
  expect(result.hidden).toBe(0);
});

test('Milky Way stays renderable through quality, star and sky-brightness toggles', async ({ page }) => {
  const shaderErrors: string[] = [];
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      /THREE\.WebGLProgram|Shader Error|INVALID_OPERATION|ERROR: 0:/.test(message.text())
    )
      shaderErrors.push(message.text());
  });
  await page.goto('/?scenario=milkyway');
  const sky = page.getByRole('img', { name: /^Sky view\./ });
  await expect(sky).toBeVisible();
  await expect(page.getByText('The 3D sky could not start', { exact: false })).toHaveCount(0);
  await sky.focus();
  for (let i = 0; i < 18; i++) await sky.press('Shift+ArrowRight');

  // Screen pixels, not a shader-source string: verify that changing the layer changes the view.
  const brightness = async () => {
    const png = await sky.screenshot();
    return page.evaluate(async (base64) => {
      const image = new Image();
      image.src = 'data:image/png;base64,' + base64;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 48;
      canvas.height = 32;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let total = 0;
      for (let i = 0; i < pixels.length; i += 4)
        total += pixels[i] + pixels[i + 1] + pixels[i + 2];
      return total / (3 * canvas.width * canvas.height);
    }, png.toString('base64'));
  };
  const openLayers = async () => page.getByRole('button', { name: 'Layers', exact: true }).click();
  const closeLayers = async () => page.getByRole('button', { name: 'Close inspector' }).click();

  const dark = await brightness();
  await openLayers();
  const stars = page.getByRole('button', { name: 'Stars', exact: true });
  await expect(stars).toHaveAttribute('aria-pressed', 'true');
  await stars.click();
  await expect(stars).toHaveAttribute('aria-pressed', 'false');
  await closeLayers();
  const noStars = await brightness();
  expect(dark).toBeGreaterThan(noStars);

  await openLayers();
  await stars.click();
  await page.getByRole('combobox', { name: /quality/i }).selectOption('low');
  await closeLayers();
  await expect.poll(brightness).toBeGreaterThan(noStars);

  await openLayers();
  await page.getByRole('combobox', { name: /light pollution/i }).selectOption('city');
  await closeLayers();
  const city = await brightness();
  expect(dark).toBeGreaterThan(city);

  await openLayers();
  await page.getByRole('combobox', { name: /light pollution/i }).selectOption('dark');
  await page.getByRole('combobox', { name: /quality/i }).selectOption('high');
  await closeLayers();
  await expect.poll(brightness).toBeGreaterThan(city);
  expect(shaderErrors).toEqual([]);
});
