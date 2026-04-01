import { Mesh, Scene, VertexData } from '@babylonjs/core';

export interface ShellGeometryOptions {
  innerRadius: number;
  outerRadius: number;
  segments: number;
  radialSubdivisions: number;
}

export class ShellGeometry {
  public static create(name: string, options: ShellGeometryOptions, scene: Scene): Mesh {
    const mesh = new Mesh(name, scene);
    const vertexData = new VertexData();

    const positions: number[] = [];
    const indices: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];

    const { innerRadius, outerRadius, segments, radialSubdivisions } = options;
    const radiusStep = radialSubdivisions > 1 ? (outerRadius - innerRadius) / (radialSubdivisions - 1) : 0;

    let vertexOffset = 0;

    for (let s = 0; s < radialSubdivisions; s++) {
      const currentRadius = radialSubdivisions > 1 ? innerRadius + s * radiusStep : outerRadius;

      for (let lat = 0; lat <= segments; lat++) {
        const theta = (lat * Math.PI) / segments;
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);

        for (let lon = 0; lon <= segments; lon++) {
          const phi = (lon * 2 * Math.PI) / segments;
          const sinPhi = Math.sin(phi);
          const cosPhi = Math.cos(phi);

          const x = cosPhi * sinTheta;
          const y = cosTheta;
          const z = sinPhi * sinTheta;

          positions.push(currentRadius * x, currentRadius * y, currentRadius * z);
          normals.push(x, y, z);

          const u = 1 - lon / segments;
          const v = 1 - lat / segments;
          uvs.push(u, v);
        }
      }

      for (let lat = 0; lat < segments; lat++) {
        for (let lon = 0; lon < segments; lon++) {
          const first = lat * (segments + 1) + lon + vertexOffset;
          const second = first + segments + 1;

          indices.push(first, second, first + 1);
          indices.push(second, second + 1, first + 1);
        }
      }

      vertexOffset += (segments + 1) * (segments + 1);
    }

    vertexData.positions = positions;
    vertexData.indices = indices;
    vertexData.normals = normals;
    vertexData.uvs = uvs;

    vertexData.applyToMesh(mesh);

    return mesh;
  }
}
