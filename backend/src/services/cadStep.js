import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const MM2_PER_SQ_IN = 645.16;
const MM_PER_IN = 25.4;

let occtPromise = null;
function loadOcct() {
  if (!occtPromise) {
    const occtimportjs = require("occt-import-js");
    occtPromise = occtimportjs();
  }
  return occtPromise;
}

export function isStepFile(file) {
  const name = String(file?.originalname ?? file?.filename ?? "").toLowerCase();
  return /\.(step|stp)$/.test(name);
}

/**
 * Reads a STEP/STP solid with OpenCascade (WASM) and returns real geometry metrics.
 * STEP stores lengths in the file's unit; OpenCascade's reader normalises them to millimetres,
 * so the area (mm²) is converted to square inches here.
 * @param {Buffer} buffer
 * @returns {Promise<{areaSqIn:number, bboxIn:{l:number,w:number,h:number}, volumeCuIn:number, meshCount:number, triangleCount:number}>}
 */
export async function analyzeStep(buffer) {
  const occt = await loadOcct();
  const result = occt.ReadStepFile(new Uint8Array(buffer), {
    linearUnit: "millimeter",
    linearDeflection: 0.1,
    angularDeflection: 0.5,
  });
  if (!result?.success || !Array.isArray(result.meshes) || result.meshes.length === 0) {
    throw new Error("Could not read geometry from the STEP file (is it a valid solid model?).");
  }

  let areaMm2 = 0;
  let volumeMm3 = 0;
  let triangleCount = 0;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  for (const mesh of result.meshes) {
    const pos = mesh.attributes?.position?.array;
    const idx = mesh.index?.array;
    if (!pos || !idx) continue;
    for (let i = 0; i < pos.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const v = pos[i + k];
        if (v < min[k]) min[k] = v;
        if (v > max[k]) max[k] = v;
      }
    }
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3;
      const b = idx[t + 1] * 3;
      const c = idx[t + 2] * 3;
      const ax = pos[a], ay = pos[a + 1], az = pos[a + 2];
      const bx = pos[b], by = pos[b + 1], bz = pos[b + 2];
      const cx = pos[c], cy = pos[c + 1], cz = pos[c + 2];
      const ux = bx - ax, uy = by - ay, uz = bz - az;
      const vx = cx - ax, vy = cy - ay, vz = cz - az;
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      areaMm2 += 0.5 * Math.sqrt(nx * nx + ny * ny + nz * nz);
      // signed tetra volume against origin (valid for closed, outward-oriented shells)
      volumeMm3 += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
      triangleCount++;
    }
  }

  if (!(areaMm2 > 0)) throw new Error("STEP file contains no surface geometry.");

  const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
  return {
    areaSqIn: round(areaMm2 / MM2_PER_SQ_IN),
    bboxIn: {
      l: round((max[0] - min[0]) / MM_PER_IN, 3),
      w: round((max[1] - min[1]) / MM_PER_IN, 3),
      h: round((max[2] - min[2]) / MM_PER_IN, 3),
    },
    volumeCuIn: round(Math.abs(volumeMm3) / MM_PER_IN ** 3, 3),
    meshCount: result.meshes.length,
    triangleCount,
  };
}
