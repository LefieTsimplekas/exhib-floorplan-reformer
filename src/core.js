// ===== Floor-plan core: DWG json -> stands per pavilion -> display lists (mm on A3) =====
// Port of the tested Python pipeline (fp.py / geom.py). Depends on global `jsts`.
const FP = (() => {
  const J = (typeof jsts !== 'undefined') ? jsts : globalThis.jsts;
  const GF = new J.geom.GeometryFactory();
  const Co = J.geom.Coordinate;
  const LS = pts => GF.createLineString(pts.map(p => new Co(p[0], p[1])));
  const PT = (x, y) => GF.createPoint(new Co(x, y));
  const BOX = (x0, y0, x1, y1) => GF.toGeometry(new J.geom.Envelope(x0, x1, y0, y1));
  const ring = g => GF.createPolygon(GF.createLinearRing(g.getExteriorRing().getCoordinates()));
  const unionAll = arr => arr.length ? J.operation.union.UnaryUnionOp.union(GF.createGeometryCollection(arr)) : GF.createGeometryCollection([]);
  // Robust polygonizer: integer grid, own noding, dangle + cut-edge removal, face tracing with holes.
  // segs: [[x1,y1,x2,y2], ...]; grid: snap size in drawing units.
  function polygonizeSegs(segs, grid) {
    const S = 1 / grid, q = v => Math.round(v * S);
    let L = [];
    const seen = new Set();
    for (const [x1, y1, x2, y2] of segs) {
      let a = [q(x1), q(y1)], b = [q(x2), q(y2)];
      if (a[0] === b[0] && a[1] === b[1]) continue;
      if (a[0] > b[0] || (a[0] === b[0] && a[1] > b[1])) [a, b] = [b, a];
      const k = a + '|' + b; if (seen.has(k)) continue; seen.add(k);
      L.push({ a, b, pts: [a, b] });
    }
    // spatial hash
    const CELL = Math.max(1, Math.round(2 * S)), grid2 = new Map();
    L.forEach((sg, i) => {
      const x0 = Math.floor(Math.min(sg.a[0], sg.b[0]) / CELL), x1 = Math.floor(Math.max(sg.a[0], sg.b[0]) / CELL);
      const y0 = Math.floor(Math.min(sg.a[1], sg.b[1]) / CELL), y1 = Math.floor(Math.max(sg.a[1], sg.b[1]) / CELL);
      for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) { const k = gx + ',' + gy; let c = grid2.get(k); if (!c) grid2.set(k, c = []); c.push(i); }
    });
    const done = new Set();
    const cross = (ux, uy, vx, vy) => ux * vy - uy * vx;
    for (const cell of grid2.values()) for (let ii = 0; ii < cell.length; ii++) for (let jj = ii + 1; jj < cell.length; jj++) {
      const i = cell[ii], j = cell[jj], key = i < j ? i * 1e7 + j : j * 1e7 + i;
      if (done.has(key)) continue; done.add(key);
      const s1 = L[i], s2 = L[j];
      const ax = s1.a[0], ay = s1.a[1], rx = s1.b[0] - ax, ry = s1.b[1] - ay;
      const cx = s2.a[0], cy = s2.a[1], sx = s2.b[0] - cx, sy = s2.b[1] - cy;
      if (Math.max(ax, ax + rx) < Math.min(cx, cx + sx) || Math.max(cx, cx + sx) < Math.min(ax, ax + rx) ||
          Math.max(ay, ay + ry) < Math.min(cy, cy + sy) || Math.max(cy, cy + sy) < Math.min(ay, ay + ry)) continue;
      const d = cross(rx, ry, sx, sy), qpx = cx - ax, qpy = cy - ay;
      if (d !== 0) {
        const t = cross(qpx, qpy, sx, sy) / d, u = cross(qpx, qpy, rx, ry) / d;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) { const P = [Math.round(ax + t * rx), Math.round(ay + t * ry)]; s1.pts.push(P); s2.pts.push(P); }
      } else if (cross(qpx, qpy, rx, ry) === 0) {
        const rr = rx * rx + ry * ry, ss = sx * sx + sy * sy;
        for (const P of [s2.a, s2.b]) { const t = ((P[0] - ax) * rx + (P[1] - ay) * ry) / rr; if (t > 0 && t < 1) s1.pts.push(P); }
        for (const P of [s1.a, s1.b]) { const t = ((P[0] - cx) * sx + (P[1] - cy) * sy) / ss; if (t > 0 && t < 1) s2.pts.push(P); }
      }
    }
    // snap rounding: every segment passing within half a grid cell of a hot pixel is split there
    const hot = new Map();
    const addHot = P => { const k = P[0] + ',' + P[1]; if (!hot.has(k)) hot.set(k, P); };
    for (const sg of L) for (const P of sg.pts) addHot(P);
    const hgrid = new Map();
    for (const P of hot.values()) { const k = Math.floor(P[0] / CELL) + ',' + Math.floor(P[1] / CELL); let c = hgrid.get(k); if (!c) hgrid.set(k, c = []); c.push(P); }
    for (const sg of L) {
      const ax = sg.a[0], ay = sg.a[1], rx = sg.b[0] - ax, ry = sg.b[1] - ay, rr = rx * rx + ry * ry;
      const x0 = Math.floor((Math.min(ax, sg.b[0]) - 1) / CELL), x1 = Math.floor((Math.max(ax, sg.b[0]) + 1) / CELL);
      const y0 = Math.floor((Math.min(ay, sg.b[1]) - 1) / CELL), y1 = Math.floor((Math.max(ay, sg.b[1]) + 1) / CELL);
      const have = new Set(sg.pts.map(P => P[0] + ',' + P[1]));
      for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
        const c = hgrid.get(gx + ',' + gy); if (!c) continue;
        for (const P of c) {
          const k = P[0] + ',' + P[1]; if (have.has(k)) continue;
          let t = ((P[0] - ax) * rx + (P[1] - ay) * ry) / rr; if (t <= 0 || t >= 1) continue;
          const d = Math.hypot(P[0] - ax - t * rx, P[1] - ay - t * ry);
          if (d <= 0.71) { sg.pts.push(P); have.add(k); }
        }
      }
    }
    // planar graph
    const nodes = new Map(), edges = new Map();
    const node = p => { const k = p[0] + ',' + p[1]; let n = nodes.get(k); if (!n) nodes.set(k, n = { k, x: p[0], y: p[1], out: [] }); return n; };
    for (const sg of L) {
      const rx = sg.b[0] - sg.a[0], ry = sg.b[1] - sg.a[1];
      const ps = sg.pts.map(P => [P, (P[0] - sg.a[0]) * rx + (P[1] - sg.a[1]) * ry]).sort((u, v) => u[1] - v[1]).map(u => u[0]);
      for (let i = 0; i + 1 < ps.length; i++) {
        const A = node(ps[i]), B = node(ps[i + 1]); if (A === B) continue;
        const k = A.k < B.k ? A.k + '|' + B.k : B.k + '|' + A.k; if (edges.has(k)) continue;
        edges.set(k, { A, B, alive: true });
      }
    }
    for (const e of edges.values()) { e.A.out.push(e); e.B.out.push(e); }
    const deg = n => n.out.reduce((c, e) => c + (e.alive ? 1 : 0), 0);
    const prune = () => {
      const st = [...nodes.values()].filter(n => deg(n) === 1);
      while (st.length) { const n = st.pop(); for (const e of n.out) if (e.alive) { e.alive = false; const o = e.A === n ? e.B : e.A; if (deg(o) === 1) st.push(o); } }
    };
    let cycles;
    for (let iter = 0; iter < 20; iter++) {
      prune();
      // half-edges sorted by angle at each node
      const he = new Map();
      for (const n of nodes.values()) {
        const outs = n.out.filter(e => e.alive).map(e => { const o = e.A === n ? e.B : e.A; return { from: n, to: o, e, ang: Math.atan2(o.y - n.y, o.x - n.x) }; }).sort((u, v) => u.ang - v.ang);
        outs.forEach((h, i) => { h.idx = i; h.list = outs; he.set(n.k + '>' + h.to.k, h); });
      }
      const vis = new Set(); cycles = [];
      for (const [k0, h0] of he) {
        if (vis.has(k0)) continue;
        const cyc = []; let h = h0, guard = 0;
        while (!vis.has(h.from.k + '>' + h.to.k) && guard++ < 1e6) {
          vis.add(h.from.k + '>' + h.to.k); cyc.push(h);
          const twin = he.get(h.to.k + '>' + h.from.k), lst = twin.list;
          h = lst[(twin.idx - 1 + lst.length) % lst.length];
        }
        cycles.push(cyc);
      }
      // cut edges: both directions inside the same cycle
      let cut = 0;
      for (const cyc of cycles) { const es = new Set(); for (const h of cyc) { if (es.has(h.e)) { h.e.alive = false; cut++; } es.add(h.e); } }
      if (!cut) break;
    }
    const area = cyc => { let a = 0; for (const h of cyc) a += h.from.x * h.to.y - h.to.x * h.from.y; return a / 2; };
    const coords = cyc => { const c = cyc.map(h => new Co(h.from.x / S, h.from.y / S)); c.push(c[0].copy()); return c; };
    const shells = [], holes = [];
    for (const cyc of cycles) { if (cyc.length < 3) continue; const a = area(cyc); if (a > 0) shells.push({ cyc, a, ring: cyc.map(h => [h.from.x, h.from.y]) }); else if (a < 0) holes.push({ cyc, a: -a }); }
    const inRing = (x, y, R) => { let c = false; for (let i = 0, j = R.length - 1; i < R.length; j = i++) { const [xi, yi] = R[i], [xj, yj] = R[j]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c; } return c; };
    for (const sh of shells) sh.holes = [];
    for (const ho of holes) {
      const p = ho.cyc[0].from; let best = null;
      for (const sh of shells) if (sh.a > ho.a && (!best || sh.a < best.a) && inRing(p.x + 0.5, p.y + 0.37, sh.ring) && !sh.cyc.some(h => h.from === p)) best = sh;
      if (best) best.holes.push(ho);
    }
    const out = [];
    for (const sh of shells) {
      try {
        const poly = GF.createPolygon(GF.createLinearRing(coords(sh.cyc)), sh.holes.map(h => GF.createLinearRing(coords(h.cyc).reverse())));
        out.push(poly);
      } catch (e) { /* skip degenerate */ }
    }
    return out;
  }
  const parts = g => { const out = []; for (let i = 0; i < g.getNumGeometries(); i++) out.push(g.getGeometryN(i)); return out; };
  const lineParts = g => {
    const out = [];
    const walk = h => {
      const t = h.getGeometryType();
      if (t === 'LineString' || t === 'LinearRing') out.push(h.getCoordinates().map(c => [c.x, c.y]));
      else if (t === 'Polygon') out.push(h.getExteriorRing().getCoordinates().map(c => [c.x, c.y]));
      else if (h.getNumGeometries && h.getNumGeometries() > 0 && t !== 'Point') for (let i = 0; i < h.getNumGeometries(); i++) walk(h.getGeometryN(i));
    };
    walk(g); return out.filter(p => p.length >= 2);
  };


  // ---- own ring helpers (robust, no overlay) ----
  const ringOf = poly => poly.getExteriorRing().getCoordinates().map(c => [c.x, c.y]);
  const extraKey = p => { const c = p.getCentroid(); return c.getX().toFixed(1) + ',' + c.getY().toFixed(1); };
  function inRingF(x, y, R) { let c = false; for (let i = 0, j = R.length - 1; i < R.length; j = i++) { const [xi, yi] = R[i], [xj, yj] = R[j]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c; } return c; }
  function distRing(x, y, R) { let m = Infinity; for (let i = 0; i + 1 < R.length; i++) { const [ax, ay] = R[i], [bx, by] = R[i + 1], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy; let t = L2 ? ((x - ax) * dx + (y - ay) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t)); const d = Math.hypot(x - ax - t * dx, y - ay - t * dy); if (d < m) m = d; } return m; }
  const safe = (fn, fb) => { try { return fn(); } catch (e) { return fb; } };
  // clip a polyline: keep parts inside box and outside all rings (shrunk by `inset`)
  function clipWall(pts, box, rings, inset) {
    const [bx0, by0, bx1, by1] = box, out = []; let cur = null;
    const inside = (x, y) => x >= bx0 && x <= bx1 && y >= by0 && y <= by1 && !rings.some(r => x >= r.e[0] && x <= r.e[2] && y >= r.e[1] && y <= r.e[3] && inRingF(x, y, r.R) && distRing(x, y, r.R) > inset);
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const ts = [0, 1];
      // box crossings
      for (const [v0, v1, lim] of [[ax, bx, bx0], [ax, bx, bx1], [ay, by, by0], [ay, by, by1]]) if (v1 !== v0) { const t = (lim - v0) / (v1 - v0); if (t > 0 && t < 1) ts.push(t); }
      // ring crossings
      const sx0 = Math.min(ax, bx), sx1 = Math.max(ax, bx), sy0 = Math.min(ay, by), sy1 = Math.max(ay, by);
      for (const r of rings) {
        if (sx1 < r.e[0] - 0.1 || sx0 > r.e[2] + 0.1 || sy1 < r.e[1] - 0.1 || sy0 > r.e[3] + 0.1) continue;
        for (let k = 0; k + 1 < r.R.length; k++) {
          const [cx, cy] = r.R[k], [dx2, dy2] = r.R[k + 1], rx = bx - ax, ry = by - ay, sx = dx2 - cx, sy = dy2 - cy;
          const d = rx * sy - ry * sx; if (Math.abs(d) < 1e-12) continue;
          const t = ((cx - ax) * sy - (cy - ay) * sx) / d, u = ((cx - ax) * ry - (cy - ay) * rx) / d;
          if (t > 0 && t < 1 && u >= -0.01 && u <= 1.01) ts.push(t);
        }
      }
      ts.sort((p, q) => p - q);
      for (let k = 0; k + 1 < ts.length; k++) {
        const t0 = ts[k], t1 = ts[k + 1]; if (t1 - t0 < 1e-9) continue;
        const tm = (t0 + t1) / 2, keep = inside(ax + (bx - ax) * tm, ay + (by - ay) * tm);
        const P0 = [ax + (bx - ax) * t0, ay + (by - ay) * t0], P1 = [ax + (bx - ax) * t1, ay + (by - ay) * t1];
        if (keep) { if (cur && Math.hypot(cur[cur.length - 1][0] - P0[0], cur[cur.length - 1][1] - P0[1]) < 1e-9) cur.push(P1); else { cur = [P0, P1]; out.push(cur); } }
        else cur = null;
      }
    }
    return out;
  }

  // ---------- reading entities (geom.py) ----------
  const clean = t => (t || '').replace(/\\P/g, '\n').replace(/\\[A-Za-z][^;\\{}]*;/g, '').replace(/[{}]/g, '').trim();
  function arcpts(cx, cy, R, a0, a1) {
    if (a1 < a0) a1 += 2 * Math.PI;
    const n = Math.max(8, Math.floor((a1 - a0) / (Math.PI / 36)));
    const o = []; for (let i = 0; i <= n; i++) o.push([cx + R * Math.cos(a0 + (a1 - a0) * i / n), cy + R * Math.sin(a0 + (a1 - a0) * i / n)]);
    return o;
  }
  function bulge(p0, p1, b) {
    if (Math.abs(b) < 1e-9) return [p0, p1];
    const th = 4 * Math.atan(b), dx = p1[0] - p0[0], dy = p1[1] - p0[1], ch = Math.hypot(dx, dy);
    const R = ch / (2 * Math.sin(th / 2)), mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
    const h = R * Math.cos(th / 2), nx = -dy / ch, ny = dx / ch, cx = mx + nx * h, cy = my + ny * h;
    const a0 = Math.atan2(p0[1] - cy, p0[0] - cx), o = [];
    for (let i = 0; i <= 12; i++) o.push([cx + Math.abs(R) * Math.cos(a0 + th * i / 12), cy + Math.abs(R) * Math.sin(a0 + th * i / 12)]);
    return o;
  }
  // Greek text from old DWG versions can arrive as Latin-1 look-alikes (e.g. "Â" instead of "Β"): decode as Windows-1253
  let dec1253 = null; try { dec1253 = new TextDecoder('windows-1253'); } catch (e) {}
  function fix1253(t) {
    if (!dec1253 || !t || /[\u0370-\u03ff]/.test(t) || !/[\u00c0-\u00fe]/.test(t)) return t;
    if ([...t].some(ch => ch.charCodeAt(0) > 255)) return t;
    return dec1253.decode(Uint8Array.from([...t].map(ch => ch.charCodeAt(0))));
  }
  // a text item with an estimated centre, whatever its justification (TEXT halign/valign, MTEXT attachment point)
  function textItem(e, t, L, f, T) {
    const text = fix1253(clean(e.text)), h = (e.textHeight || 1), n = Math.max(1, text.length), w = 0.66 * h * n;
    let cx, cy;
    if (t === 'MTEXT') {
      const ip = e.insertionPoint || { x: 0, y: 0 }, ap = e.attachmentPoint || 1, col = (ap - 1) % 3, row = Math.floor((ap - 1) / 3);
      cx = ip.x + [w / 2, 0, -w / 2][col]; cy = ip.y + [-h / 2, 0, h / 2][row];
    } else {
      const sp = e.startPoint || { x: 0, y: 0 }, ep = e.endPoint, ha = e.halign || 0, va = e.valign || 0;
      cx = sp.x + w / 2; cy = sp.y + h / 2;
      if ((ha || va) && ep && (ep.x || ep.y)) {
        if (ha === 1 || ha === 4) cx = ep.x; else if (ha === 2) cx = ep.x - w / 2; else if (ha === 3 || ha === 5) cx = (sp.x + ep.x) / 2;
        if (va === 1) cy = ep.y + h / 2; else if (va === 2) cy = ep.y; else if (va === 3) cy = ep.y - h / 2; else if (ha === 4) cy = ep.y;
      }
    }
    const p = (e.startPoint && t !== 'MTEXT') ? e.startPoint : (e.insertionPoint || { x: 0, y: 0 });
    return { layer: L, kind: t, pt: f(p.x, p.y), c: f(cx, cy), text, hgt: h * Math.abs(T[2]) };
  }
  function collect(db, ents, T = [0, 0, 1, 1, 0, 0, 0], parent = null, depth = 0, out = []) {
    const blocks = db.__blocks || (db.__blocks = Object.fromEntries(db.tables.BLOCK_RECORD.entries.map(b => [b.name, b])));
    const [ox, oy, sx, sy, r, bx, by] = T, c = Math.cos(r), s = Math.sin(r);
    const f = (x, y) => [ox + ((x - bx) * sx) * c - ((y - by) * sy) * s, oy + ((x - bx) * sx) * s + ((y - by) * sy) * c];
    for (const e of ents) {
      let L = e.layer; if (L === '0' && parent) L = parent;
      const t = e.type;
      try {
        if (t === 'LINE') out.push({ layer: L, kind: 'line', pts: [f(e.startPoint.x, e.startPoint.y), f(e.endPoint.x, e.endPoint.y)] });
        else if (t === 'LWPOLYLINE') {
          const v = e.vertices || [], n = v.length, closed = !!(e.flag & 1) || !!(e.flag & 512);
          const segs = closed ? n : n - 1; let pts = [];
          for (let i = 0; i < segs; i++) {
            const a = [v[i].x, v[i].y], b = [v[(i + 1) % n].x, v[(i + 1) % n].y];
            const p = bulge(a, b, v[i].bulge || 0); pts = pts.length ? pts.concat(p.slice(1)) : p;
          }
          if (pts.length >= 2) out.push({ layer: L, kind: 'pl', pts: pts.map(p => f(p[0], p[1])) });
        } else if (t === 'POLYLINE2D' || t === 'POLYLINE3D') {
          // older "heavy" polylines (written by some programs, e.g. ActCAD, and by old drawings)
          const v = (e.vertices || []).filter(q => q && isFinite(q.x)), n = v.length, closed = !!(e.flag & 1);
          let pts = [];
          for (let i = 0; i < (closed ? n : n - 1); i++) {
            const a = [v[i].x, v[i].y], b = [v[(i + 1) % n].x, v[(i + 1) % n].y];
            const p = t === 'POLYLINE2D' ? bulge(a, b, v[i].bulge || 0) : [a, b]; pts = pts.length ? pts.concat(p.slice(1)) : p;
          }
          if (pts.length >= 2) out.push({ layer: L, kind: 'pl', pts: pts.map(p => f(p[0], p[1])) });
        } else if (t === 'ARC') {
          let p = arcpts(e.center.x, e.center.y, e.radius, e.startAngle, e.endAngle);
          if ((e.extrusionDirection || {}).z < 0) p = p.map(([x, y]) => [-x, y]);
          out.push({ layer: L, kind: 'arc', pts: p.map(q => f(q[0], q[1])) });
        } else if (t === 'CIRCLE') {
          const p = arcpts(e.center.x, e.center.y, e.radius, 0, 2 * Math.PI - 1e-6);
          out.push({ layer: L, kind: 'circle', pts: p.map(q => f(q[0], q[1])) });
        } else if (t === 'TEXT' || t === 'MTEXT') {
          out.push(textItem(e, t, L, f, T));
        } else if (t === 'INSERT' && depth < 5) {
          const b = blocks[e.name];
          if (b && !((b.flags || 0) & 4)) {
            // attributes (e.g. a stand number stored as a block attribute) are already placed in the drawing
            for (const a of (e.attribs || [])) {
              const tb = a.text || {};
              if (!tb.text || (a.flags & 1)) continue; // skip invisible
              out.push(textItem({ ...tb, layer: a.layer }, 'TEXT', a.layer === '0' && parent ? parent : a.layer, f, T));
            }
            const o = f(e.insertionPoint.x, e.insertionPoint.y), bp = b.basePoint || { x: 0, y: 0 };
            collect(db, b.entities || [], [o[0], o[1], (e.xScale ?? 1) * T[2], (e.yScale ?? 1) * T[3], T[4] + (e.rotation || 0), bp.x, bp.y], L, depth + 1, out);
          }
        }
      } catch (ex) { /* skip malformed entity */ }
    }
    return out;
  }
  function modelSpaceId(db) {
    const c = {}; for (const e of db.entities) { const k = e.ownerBlockRecordSoftId; c[k] = (c[k] || 0) + 1; }
    return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0];
  }
  function survey(db) {
    const ms = modelSpaceId(db);
    const M = db.entities.filter(e => e.ownerBlockRecordSoftId === ms);
    const layers = {};
    for (const e of M) {
      const L = layers[e.layer] || (layers[e.layer] = { name: e.layer, geo: 0, texts: [] });
      if (e.type === 'TEXT' || e.type === 'MTEXT') L.texts.push(fix1253(clean(e.text)));
      else L.geo++;
      if (e.type === 'INSERT') for (const a of (e.attribs || [])) { if (!a.text || !a.text.text) continue; const A = layers[a.layer] || (layers[a.layer] = { name: a.layer, geo: 0, texts: [] }); (A.attrs || (A.attrs = [])).push(fix1253(clean(a.text.text))); }
    }
    const xrecs = {}; for (const b of db.tables.BLOCK_RECORD.entries) if ((b.flags || 0) & 4) xrecs[b.name] = b;
    // the xref's base point (its INSBASE) maps onto the insertion point: world = ins + R·S·(p − base)
    const xrefs = db.entities.filter(e => e.type === 'INSERT' && xrecs[e.name]).map(e => {
      const bp = xrecs[e.name].basePoint;
      return { name: e.name, offset: [e.insertionPoint.x, e.insertionPoint.y], scale: e.xScale ?? 1, yscale: e.yScale ?? e.xScale ?? 1, rotation: e.rotation || 0, base: bp ? [bp.x || 0, bp.y || 0] : null };
    });
    return { ms, layers: Object.values(layers), xrefs };
  }

  // ---------- codes ----------
  const GREEK = { 'Α': 'A', 'Β': 'B', 'Γ': 'G', 'Δ': 'D', 'Ε': 'E', 'Ζ': 'Z', 'Η': 'H', 'Θ': 'TH', 'Ι': 'I', 'Κ': 'K', 'Λ': 'L', 'Μ': 'M', 'Ν': 'N', 'Ξ': 'X', 'Ο': 'O', 'Π': 'P', 'Ρ': 'P', 'Σ': 'S', 'Τ': 'T', 'Υ': 'Y', 'Φ': 'F', 'Χ': 'X', 'Ψ': 'PS', 'Ω': 'O' };
  function norm(t) {
    t = (t || '').trim().normalize('NFD').replace(/[̀-ͯ]/g, '');
    let o = '';
    for (let ch of t) {
      if (ch === 'ς') ch = 'σ';
      const U = ch.toUpperCase();
      if (GREEK[U]) o += (ch === U ? GREEK[U] : GREEK[U].toLowerCase()); else o += ch;
    }
    return o;
  }
  // a code typed by a person: Latin letters, two digits, leading letters in capitals (d2a -> D02a)
  const typedCode = (t, n = 2) => pad(norm(t).replace(/\s+/g, ''), n).replace(/^[a-z]+/, m => m.toUpperCase());
  const DEFAULT_RE = '^([A-Za-z]{1,2}\\d+[A-Za-z]?|\\d+[A-Za-z]{0,2})$';
  function pad(t, n) {
    if (!n) return t;
    t = t.replace(/^([A-Za-z]+)(\d+)([A-Za-z]?)$/, (m, a, d, b) => a + d.padStart(n, '0') + b);
    return t.replace(/^(\d+)([A-Za-z]*)$/, (m, d, b) => d.padStart(n, '0') + b);
  }

  // ---------- auto-guess ----------
  function guessLayers(sv, re = DEFAULT_RE) {
    const R = new RegExp(re);
    const pickNum = key => sv.layers.filter(L => { const T = L[key] || []; const m = T.filter(t => R.test(norm(t))).length; return m >= 5 && m / T.length >= 0.5; }).map(L => L.name);
    // stand codes as plain text first; block attributes only when no text layer qualifies (sockets, manholes etc. also carry numbers)
    let number = pickNum('texts'); if (!number.length) number = pickNum('attrs');
    const stand = sv.layers.filter(L => L.geo > 0 && /stand|stant/i.test(L.name) && !/_no\b|numb|name|_old/i.test(L.name)).map(L => L.name);
    const wallRe = /^(toixos|helexpo|porta|portes|skales|walls?|doors?|stairs?)$/i;
    const wall = sv.layers.filter(L => L.geo > 0 && wallRe.test(L.name)).map(L => L.name);
    return { number, stand, wall };
  }

  // ---------- main detection (fp.py) ----------
  function loadGeometry(host, xrefDbs) {
    // host: {db, ms}; xrefDbs: [{db, offset, scale, rotation}]
    let G = collect(host.db, host.db.entities.filter(e => e.ownerBlockRecordSoftId === host.ms));
    for (const x of xrefDbs) {
      const ms = modelSpaceId(x.db);
      const ib = x.db.header && x.db.header.INSBASE, base = x.base || (ib ? [ib.x || 0, ib.y || 0] : [0, 0]);
      const XG = collect(x.db, x.db.entities.filter(e => e.ownerBlockRecordSoftId === ms), [x.offset[0], x.offset[1], x.scale, x.yscale ?? x.scale, x.rotation, base[0], base[1]]);
      XG.forEach(g => g.xref = true); G = G.concat(XG);
    }
    return G;
  }
  function pct(arr, p) { if (!arr.length) return 0; const a = arr.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.max(0, Math.round(p / 100 * (a.length - 1))))]; }
  function guessBuilding(G, cfg) {
    const WL = new Set(cfg.wall_layers), SL = new Set(cfg.stand_layers);
    let src = G.filter(g => g.pts && WL.has(g.layer));
    if (src.length < 5) src = G.filter(g => g.pts && SL.has(g.layer));
    const box = arr => { const xs = [], ys = []; for (const g of arr) for (const p of g.pts) { xs.push(p[0]); ys.push(p[1]); } return [pct(xs, 0.5) - 3, pct(ys, 0.5) - 3, pct(xs, 99.5) + 3, pct(ys, 99.5) + 3]; };
    const B = box(src);
    // stands just outside the walls (e.g. at an entrance) still belong to the plan: widen by the stand drawing, but only by a few metres
    const sg = G.filter(g => g.pts && SL.has(g.layer));
    if (sg.length && src !== sg) { const S = box(sg), lim = 15; B[0] = Math.max(Math.min(B[0], S[0]), B[0] - lim); B[1] = Math.max(Math.min(B[1], S[1]), B[1] - lim); B[2] = Math.min(Math.max(B[2], S[2]), B[2] + lim); B[3] = Math.min(Math.max(B[3], S[3]), B[3] + lim); }
    return B;
  }

  function detect(G, cfg) {
    const BX = BOX(...cfg.building);
    const [bx0, by0, bx1, by1] = cfg.building;
    const inb = g => g.pts ? g.pts.some(p => p[0] >= bx0 && p[0] <= bx1 && p[1] >= by0 && p[1] <= by1) || LS(g.pts).intersects(BX)
      : (g.pt[0] >= bx0 && g.pt[0] <= bx1 && g.pt[1] >= by0 && g.pt[1] <= by1);
    const G0 = G; G = G.filter(inb);
    const SL = new Set(cfg.stand_layers), WL = new Set(cfg.wall_layers), NL = new Set(cfg.number_layers);
    const NRE = new RegExp(cfg.number_regex || DEFAULT_RE);
    const SNAP = cfg.snap ?? 0.005;
    const snap = p => [Math.round(p[0] / SNAP) * SNAP, Math.round(p[1] / SNAP) * SNAP];
    const segs = (list, ext = 0.2) => {
      const out = [];
      for (const pts0 of list) {
        const c = pts0.map(snap);
        for (let i = 0; i + 1 < c.length; i++) {
          const a = c[i], b = c[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
          if (L < 1e-6) continue;
          const ux = dx / L, uy = dy / L, e = L > 0.5 ? ext : 0;
          out.push([a[0] - ux * e, a[1] - uy * e, b[0] + ux * e, b[1] + uy * e]);
        }
      }
      return out;
    };
    const SG = G.filter(g => g.pts && SL.has(g.layer) && !g.xref).map(g => g.pts);
    const WGp = G.filter(g => g.pts && WL.has(g.layer)).map(g => g.pts);
    const faces = polygonizeSegs(segs(SG), SNAP).filter(f => f.getArea() > 0.3);
    let faces2 = null;
    const PADN = cfg.pad_digits ?? 2;
    const nums = G.filter(g => g.text !== undefined && NL.has(g.layer) && !g.xref && g.text && NRE.test(norm(g.text)))
      .map(g => ({ ...g, code: pad(norm(g.text), PADN) }));
    const lpt = g => g.c ? PT(g.c[0], g.c[1]) : PT(g.pt[0] + 0.33 * g.hgt * g.code.length, g.pt[1] + 0.5 * g.hgt);
    const lptOld = g => PT(g.pt[0] + 0.33 * g.hgt * g.code.length, g.pt[1] + 0.5 * g.hgt);
    const pick = (fs, p, tol) => {
      let c = fs.filter(f => f.getArea() > 1 && f.contains(p));
      if (!c.length) {
        let best = null, bd = Infinity;
        for (const f of fs) { const d = f.distance(p); if (d < bd) { bd = d; best = f; } }
        c = best && bd < tol && best.getArea() > 0.5 ? [best] : [];
      }
      return c.length ? c.reduce((a, b) => a.getArea() <= b.getArea() ? a : b) : null;
    };
    const stands = [], unmatched = [];
    for (const n of nums) {
      let p = lpt(n); let f = pick(faces, p, cfg.label_tol ?? 1.2);
      if (!f) { const p2 = lptOld(n); const f2 = pick(faces, p2, cfg.label_tol ?? 1.2); if (f2) { f = f2; p = p2; } }
      if (!f) {
        if (!faces2) faces2 = polygonizeSegs(segs(SG).concat(segs(WGp, 0.05)), SNAP);
        f = pick(faces2, p, 0.5);
        if (f && f.getArea() > (cfg.max_wall_closed_area ?? 150)) f = null;
      }
      if (!f) { unmatched.push({ code: n.code, x: p.getX(), y: p.getY() }); continue; }
      const poly = ring(f);
      const dup = stands.find(s => s.poly.equalsExact(poly, 1e-3));
      if (dup) { if (!dup.code.split('/').includes(n.code)) dup.code += '/' + n.code; continue; }
      stands.push({ code: n.code, poly, lp: p });
    }
    const coveredBy = f => stands.some(s => safe(() => s.poly.buffer(0.05).contains(f), false));
    for (const f of faces) {
      if (f.getArea() >= 4 || coveredBy(f)) continue;
      let best = null, bl = 0;
      for (const s of stands) { const l = safe(() => f.getExteriorRing().intersection(s.poly.getExteriorRing().buffer(0.06)).getLength(), 0); if (l > bl) { best = s; bl = l; } }
      if (best && bl > 0.5 * f.getExteriorRing().getLength()) {
        const u = safe(() => best.poly.union(f.buffer(0.01)).buffer(-0.01), null);
        if (u && u.getGeometryType() === 'Polygon') best.poly = ring(u);
      }
    }
    for (const sp of (cfg.splits || [])) {
      const set = new Set(sp.codes);
      const s0 = stands.find(s => { const c = s.code.split('/'); return c.length === set.size && c.every(x => set.has(x)); });
      if (!s0) continue;
      const env = s0.poly.getEnvelopeInternal(), x0 = env.getMinX(), y0 = env.getMinY(), x1 = env.getMaxX(), y1 = env.getMaxY(), n = sp.codes.length;
      const partsOut = sp.codes.map((c, i) => {
        const b = sp.direction === 'horizontal' ? BOX(x0 + (x1 - x0) * i / n, y0 - 1, x0 + (x1 - x0) * (i + 1) / n, y1 + 1)
          : BOX(x0 - 1, y0 + (y1 - y0) * i / n, x1 + 1, y0 + (y1 - y0) * (i + 1) / n);
        const q = s0.poly.intersection(b); return { code: c, poly: ring(q.getGeometryType() === 'Polygon' ? q : parts(q).sort((a, b) => b.getArea() - a.getArea())[0]), lp: q.getCentroid() };
      });
      stands.splice(stands.indexOf(s0), 1, ...partsOut);
    }
    const extra = [];
    for (const f of faces.slice().sort((a, b) => b.getArea() - a.getArea())) {
      if (f.getArea() < (cfg.min_unnumbered_area ?? 8)) continue;
      if (coveredBy(f)) continue;
      const fe = f.getEnvelopeInternal();
      let ov = 0; for (const s of stands) if (s.poly.getEnvelopeInternal().intersects(fe)) ov += safe(() => f.intersection(s.poly).getArea(), 0);
      if (ov > 0.2 * f.getArea()) continue;
      if (extra.some(e => safe(() => e.buffer(0.05).contains(f), false))) continue;
      const e = f.getEnvelopeInternal(); if (Math.min(e.getWidth(), e.getHeight()) < 2.5) continue;
      extra.push(ring(f));
    }
    // labels for pavilions: "ΠΕΡΙΠΤΕΡΟ / PAVILION" titles, number either inside or as a big separate text nearby
    const isTitle = t => /(Π\s*Ε\s*Ρ\s*[ΙΊ]\s*Π\s*Τ\s*Ε\s*Ρ\s*Ο(?!Υ)|PAVILION|PERIPTERO|\bHALL\b)/i.test(t) && !/προς|\bto\b|MANAGER|ΥΠΕΥΘ|ΓΡΑΦΕΙΟ/i.test(t);
    const near = g => g.pt[0] > bx0 - 25 && g.pt[0] < bx1 + 25 && g.pt[1] > by0 - 25 && g.pt[1] < by1 + 25;
    const bigNums = G0.filter(g => g.text && /^\d{1,3}$/.test(g.text.trim()) && near(g));
    const medH = (() => { const h = nums.map(n => n.hgt).sort((a, b) => a - b); return h.length ? h[h.length >> 1] : 1; })();
    const pavLabels = [];
    for (const g of G0) {
      if (!g.text || !isTitle(g.text) || !near(g)) continue;
      const t = g.text.replace(/(scale|κλ[ιί]μακα|ΚΛ[ΙΊ]ΜΑΚΑ)[^\n]*/ig, '').replace(/\d+\s*[:.,\/]\s*\d+/g, '');
      let num = (t.match(/(\d{1,3})/) || [])[1];
      if (!num) {
        let best = null, bd = 20;
        for (const b of bigNums) { if (b.hgt < 1.5 * medH) continue; const d = Math.hypot(b.pt[0] - g.pt[0], b.pt[1] - g.pt[1]); if (d < bd) { bd = d; best = b; } }
        if (best) num = best.text.trim();
      }
      if (num) pavLabels.push({ name: num.padStart(2, '0'), x: g.pt[0], y: g.pt[1] });
    }
    return { G, stands, unmatched, extra, WG: WGp, pavLabels };
  }

  // pavilion zones: cut where no stand crosses and the most horizontal (or vertical) wall length lies
  function guessPavilions(res, cfg, axis = 'y') {
    const k = axis === 'y' ? 1 : 0;
    const [lo, hi] = axis === 'y' ? [cfg.building[1], cfg.building[3]] : [cfg.building[0], cfg.building[2]];
    const labs = [];
    for (const L of res.pavLabels.slice().sort((a, b) => (axis === 'y' ? a.y - b.y : a.x - b.x))) if (!labs.some(x => x.name === L.name)) labs.push(L);
    if (labs.length < 2) return [{ name: labs[0]?.name || '01', min: lo, max: hi }];
    const spans = res.stands.map(s => { const e = s.poly.getEnvelopeInternal(); return axis === 'y' ? [e.getMinY(), e.getMaxY()] : [e.getMinX(), e.getMaxX()]; });
    const wallSegs = [];
    for (const pts of res.WG) for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1], d = [b[0] - a[0], b[1] - a[1]], L = Math.hypot(...d);
      if (L > 0.3 && Math.abs(d[k]) < 0.05 * L) wallSegs.push([(a[k] + b[k]) / 2, L]);
    }
    const cuts = [];
    for (let i = 0; i + 1 < labs.length; i++) {
      const a = axis === 'y' ? labs[i].y : labs[i].x, b = axis === 'y' ? labs[i + 1].y : labs[i + 1].x;
      let best = null, bestScore = -Infinity;
      for (let c = a; c <= b; c += 0.1) {
        const crossing = spans.filter(([m, M]) => m < c - 0.05 && M > c + 0.05).length;
        let w = 0; for (const [p, L] of wallSegs) if (Math.abs(p - c) < 0.6) w += L;
        const score = w - 25 * crossing;
        if (score > bestScore) { bestScore = score; best = c; }
      }
      cuts.push(best ?? (a + b) / 2);
    }
    const zones = []; let prev = lo;
    labs.forEach((L, i) => { const nx = i < cuts.length ? cuts[i] : hi; zones.push({ name: L.name, min: +prev.toFixed(1), max: +nx.toFixed(1) }); prev = nx; });
    return zones;
  }

  function assign(res, cfg) {
    const axis = cfg.axis || 'y';
    const zoneOf = c => { const v = axis === 'y' ? c.getY() : c.getX(); return (cfg.pavilions.find(P => v >= P.min && v < P.max) || {}).name; };
    for (const s of res.stands) s.pav = zoneOf(s.poly.getCentroid());
    for (const r of (cfg.renames || [])) {
      // r: {pav, from, to} applied simultaneously per pavilion
    }
    const byPav = {};
    for (const r of (cfg.renames || [])) (byPav[r.pav] = byPav[r.pav] || {})[r.from] = r.to;
    for (const s of res.stands) if (byPav[s.pav]) s.code = s.code.split('/').map(c => byPav[s.pav][c] ?? c).join('/');
    // report
    const rep = { pavs: [], unmatched: res.unmatched, merged: [], dups: [], nonLatin: [], noPav: [] };
    for (const P of cfg.pavilions) {
      const ss = res.stands.filter(s => s.pav === P.name).sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }));
      const cnt = {}; ss.forEach(s => cnt[s.code] = (cnt[s.code] || 0) + 1);
      rep.dups.push(...Object.keys(cnt).filter(k => cnt[k] > 1).map(k => ({ pav: P.name, code: k })));
      const near = ss.filter(s => { const e = s.poly.getEnvelopeInternal(); const [m, M] = axis === 'y' ? [e.getMinY(), e.getMaxY()] : [e.getMinX(), e.getMaxX()]; return Math.min(Math.abs(m - P.min), Math.abs(M - P.max)) < 4; }).map(s => s.code);
      rep.pavs.push({ name: P.name, codes: ss.map(s => s.code), near });
    }
    rep.merged = res.stands.filter(s => s.code.includes('/')).map(s => ({ pav: s.pav, code: s.code }));
    rep.nonLatin = res.stands.filter(s => /[^\x00-\x7F]/.test(s.code)).map(s => s.code);
    rep.noPav = res.stands.filter(s => !s.pav).map(s => s.code);
    return rep;
  }

  // ---------- layout to A3 (mm) ----------
  const A3 = { W: 297, H: 420 }, MMPT = 25.4 / 72;
  function layout(res, cfg, pav, measure, opts = {}) {
    // measure(text) -> {w, h} in points for font size 1 (bold sans)
    const axis = cfg.axis || 'y';
    const P = cfg.pavilions.find(p => p.name === pav);
    const exIn = e => { const c = e.getCentroid(); const v = axis === 'y' ? c.getY() : c.getX(); return v >= P.min && v < P.max; };
    const rings = res.stands.map(s => s.poly).concat(res.extra).map(p => { const R = ringOf(p), e = p.getEnvelopeInternal(); return { R, e: [e.getMinX(), e.getMinY(), e.getMaxX(), e.getMaxY()] }; });
    const [bx0, by0, bx1, by1] = cfg.building;
    const cb = axis === 'y' ? [bx0, P.min, bx1, P.max] : [P.min, by0, P.max, by1];
    // optional rotation of the sheet in steps of 90° (counter-clockwise): the geometry turns, codes are then placed upright
    const rot = (((opts.rotate || 0) % 360) + 360) % 360;
    // optional manual shift of all stands against the building, in drawing units (before rotation):
    // done by moving the walls the opposite way, so stand keys, labels and renames stay untouched
    const [sdx, sdy] = opts.shift || [0, 0];
    const wsh = [-sdx, -sdy];
    const walls0 = [];
    for (const pts of res.WG) walls0.push(...clipWall((sdx || sdy) ? pts.map(([x, y]) => [x + wsh[0], y + wsh[1]]) : pts, cb, rings, 0.04));
    const rp = rot === 90 ? ([x, y]) => [-y, x] : rot === 180 ? ([x, y]) => [-x, -y] : rot === 270 ? ([x, y]) => [y, -x] : (q => q);
    const rpoly = p => rot ? GF.createPolygon(GF.createLinearRing(p.getExteriorRing().getCoordinates().map(c => { const [x, y] = rp([c.x, c.y]); return new Co(x, y); }))) : p;
    const RS = res.stands.map(t => rot ? { ...t, poly: rpoly(t.poly), lp: PT(...rp([t.lp.getX(), t.lp.getY()])) } : t);
    const RE = res.extra.map(p => { const q = rpoly(p); q.__key = extraKey(p); q.__in = exIn(p); return q; });
    const walls = walls0.map(w => w.map(rp));
    const ss = RS.filter(t => t.pav === pav);
    const ex = RE.filter(q => q.__in);
    const allp = ss.map(t => t.poly).concat(ex);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const grow = pts => { for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } };
    walls.forEach(grow); allp.forEach(p => grow(p.getExteriorRing().getCoordinates().map(c => [c.x, c.y])));
    if (!isFinite(x0)) return null;
    x0 -= 1; y0 -= 1; x1 += 1; y1 += 1;
    // page: A3 portrait, or landscape when asked (opts.page) or when a rotated plan is wider than tall (opts.autoLandscape)
    let PW = A3.W, PH = A3.H;
    if (opts.page) { PW = opts.page.W; PH = opts.page.H; }
    else if (opts.autoLandscape && (x1 - x0) > (y1 - y0)) { PW = A3.H; PH = A3.W; }
    const rL = opts.reserveLeft || 0, rR = opts.reserveRight || 0;
    const m = 0.06, axL = m * PW + rL, axW = (1 - 2 * m) * PW - rL - rR;
    // optional space kept free above/below the plan (mm), e.g. for an exhibition image on the site version
    const rT = opts.reserveTop || 0, rB = opts.reserveBottom || 0;
    const axB = 0.7 * m * PH + rB, axH = (1 - 1.4 * m) * PH - rT - rB;
    const s = Math.min(axW / (x1 - x0), axH / (y1 - y0));
    const offX = axL + (axW - (x1 - x0) * s) / 2, offB = axB + (axH - (y1 - y0) * s) / 2;
    const X = x => offX + (x - x0) * s, Y = y => PH - (offB + (y - y0) * s);
    const tr = pts => pts.map(([x, y]) => [X(x), Y(y)]);
    const ptu = s / MMPT; // points per drawing unit
    const D = { page: { W: PW, H: PH }, scale: s, walls: walls.map(tr), stands: allp.map(p => tr(p.getExteriorRing().getCoordinates().map(c => [c.x, c.y]))), texts: [],
      extras: ex.map(p => ({ key: p.__key, pts: tr(p.getExteriorRing().getCoordinates().map(c => [c.x, c.y])) })) };
    const MAXF = cfg.max_font ?? 22, MINF = cfg.min_font ?? 7, OUTF = cfg.outside_font ?? 11, OUTMIN = 5.5;
    // obstacles for labels placed outside: every stand (all pavilions), walls of this sheet, labels already placed
    const obst = RS.map(t => t.poly).concat(RE).map(p => { const e = p.getEnvelopeInternal(); return { p, e: [e.getMinX(), e.getMinY(), e.getMaxX(), e.getMaxY()] }; });
    const wallSegs = []; for (const w of walls) for (let i = 0; i + 1 < w.length; i++) wallSegs.push([w[i][0], w[i][1], w[i + 1][0], w[i + 1][1]]);
    const placed = [];
    const segHitsRect = (s4, r) => { // Liang–Barsky
      let [x0, y0, x1, y1] = s4, t0 = 0, t1 = 1; const dx = x1 - x0, dy = y1 - y0;
      for (const [p, q] of [[-dx, x0 - r[0]], [dx, r[2] - x0], [-dy, y0 - r[1]], [dy, r[3] - y0]]) {
        if (p === 0) { if (q < 0) return false; } else { const t = q / p; if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; } }
      }
      return true;
    };
    const rectFree = (r, useWalls, margin = 0) => {
      if (placed.some(q => !(r[2] < q[0] || r[0] > q[2] || r[3] < q[1] || r[1] > q[3]))) return false;
      // keep a margin from every stand, so a code beside its stand is never closer to a neighbour
      const R = BOX(r[0] - margin, r[1] - margin, r[2] + margin, r[3] + margin);
      r = [r[0] - margin, r[1] - margin, r[2] + margin, r[3] + margin];
      for (const o of obst) { if (r[2] < o.e[0] || r[0] > o.e[2] || r[3] < o.e[1] || r[1] > o.e[3]) continue; if (safe(() => o.p.intersects(R), true)) return false; }
      if (useWalls) for (const sg of wallSegs) if (segHitsRect(sg, r)) return false;
      return true;
    };
    const labels = cfg.extra_labels || {};
    const freeJobs = ex.filter(p => (labels[p.__key] || '').trim()).map(p => {
      const raw = labels[p.__key].trim();
      const NRE2 = new RegExp(cfg.number_regex || DEFAULT_RE);
      const asCode = NRE2.test(norm(raw)) ? typedCode(raw, cfg.pad_digits ?? 2) : null;
      let lines = asCode ? [asCode] : raw.split(/\s*\n\s*/);
      if (!asCode && lines.length === 1 && raw.length > 12 && raw.includes(' ')) { const w = raw.split(' '); let best = 1, bd = 1e9; for (let i = 1; i < w.length; i++) { const d = Math.abs(w.slice(0, i).join(' ').length - w.slice(i).join(' ').length); if (d < bd) { bd = d; best = i; } } lines = [w.slice(0, best).join(' '), w.slice(best).join(' ')]; }
      return { code: lines.join('/'), poly: p, lp: p.getCentroid(), free: !asCode };
    });
    const jobs = ss.concat(freeJobs).map(st => {
      const p = st.poly, inner = p.buffer(-0.08);
      const partsC = st.code.split('/'), nl = partsC.length;
      const longest = partsC.reduce((a, b) => b.length > a.length ? b : a);
      const ref = st.free ? longest : longest.replace(/\d/g, '8').replace(/[A-Za-z]/g, 'W');
      const bb = measure(ref);
      const linesF = nl === 1 ? 1 : nl * 1.35;
      const hx = fs => bb.w * fs / ptu / 2 * 1.08, hy = fs => bb.h * fs / ptu / 2 * 1.25 * linesF;
      const fits = (c, fs) => inner.contains(BOX(c.getX() - hx(fs), c.getY() - hy(fs), c.getX() + hx(fs), c.getY() + hy(fs)));
      const maxfs = c => { if (!fits(c, 0.5)) return 0; let lo = 0, hi = MAXF; for (let i = 0; i < 10; i++) { const mm = (lo + hi) / 2; if (fits(c, mm)) lo = mm; else hi = mm; } return lo; };
      const cen = p.getCentroid(), cands = [cen];
      const e = p.getEnvelopeInternal();
      for (let i = 1; i < 12; i++) for (let j = 1; j < 12; j++) { const q = PT(e.getMinX() + e.getWidth() * i / 12, e.getMinY() + e.getHeight() * j / 12); if (p.contains(q)) cands.push(q); }
      const scored = cands.map(q => [Math.min(MAXF, 0.8 * maxfs(q)), q]);
      // allow the inside size to go a little tighter (up to 92% of what fits) before moving the code outside
      const tight = cands.map(q => [Math.min(MAXF, 0.92 * maxfs(q)), q]);
      const best = Math.max(...scored.map(a => a[0])), bestT = Math.max(...tight.map(a => a[0]));
      return { st, p, e, cen, bb, linesF, partsC, nl, scored, tight, best, bestT };
    });
    // 1) codes that fit inside
    for (const j of jobs) {
      let use = null;
      if (j.best >= MINF) use = [j.scored, j.best]; else if (j.bestT >= MINF) use = [j.tight, MINF];
      if (!use) continue;
      const [arr, fs] = use, thr = arr === j.scored ? j.best * 0.95 : MINF;
      const c = arr.filter(a => a[0] >= thr).map(a => a[1]).reduce((a, b) => a.distance(j.cen) <= b.distance(j.cen) ? a : b);
      j.out = { x: c.getX(), y: c.getY(), fs };
      const w = j.bb.w * fs / ptu / 2, h = j.bb.h * fs / ptu / 2 * j.linesF; placed.push([c.getX() - w, c.getY() - h, c.getX() + w, c.getY() + h]);
    }
    // 2) codes that do not fit: right next to the stand, centred on it, on the side that suits its shape
    const gap = 2.5 / ptu; // 2.5 pt between the stand edge and the code
    const outside = jobs.filter(j => !j.out).sort((a, b) => (b.e.getMaxY() - a.e.getMaxY()) || (a.e.getMinX() - b.e.getMinX()));
    for (const j of outside) {
      const e = j.e, W = e.getWidth(), H = e.getHeight(), cx = (e.getMinX() + e.getMaxX()) / 2, cy = (e.getMinY() + e.getMaxY()) / 2;
      let sides = H > W * 1.2 ? ['right', 'left', 'below', 'above'] : W > H * 1.2 ? ['below', 'above', 'right', 'left'] : ['right', 'below', 'left', 'above'];
      // prefer the side where the drawing had the code
      const lx = j.st.lp.getX(), ly = j.st.lp.getY();
      const pref = lx > e.getMaxX() ? 'right' : lx < e.getMinX() ? 'left' : ly < e.getMinY() ? 'below' : ly > e.getMaxY() ? 'above' : null;
      if (pref) sides = [pref, ...sides.filter(s => s !== pref)];
      const rectAt = (side, fs) => {
        const tw = j.bb.w * fs / ptu * 1.04, th = j.bb.h * fs / ptu * 1.15 * j.linesF;
        let x, y;
        if (side === 'right') { x = e.getMaxX() + gap + tw / 2; y = cy; }
        else if (side === 'left') { x = e.getMinX() - gap - tw / 2; y = cy; }
        else if (side === 'below') { x = cx; y = e.getMinY() - gap - th / 2; }
        else { x = cx; y = e.getMaxY() + gap + th / 2; }
        // beside a stand the code must not be taller than the stand, so stacked stands keep one code per row
        if ((side === 'right' || side === 'left') && th > H * 1.02) return null;
        return { x, y, r: [x - tw / 2, y - th / 2, x + tw / 2, y + th / 2] };
      };
      let got = null;
      for (const [useWalls, margin] of [[true, gap * 0.6], [false, gap * 0.6], [false, 0]]) {
        for (let fs = OUTF; fs >= OUTMIN - 1e-9 && !got; fs -= 0.5) for (const side of sides) { const c = rectAt(side, fs); if (c && rectFree(c.r, useWalls, margin)) { got = { ...c, fs }; break; } }
        if (got) break;
      }
      if (!got) { const fs = Math.max(OUTMIN, j.bestT); got = { x: j.cen.getX(), y: j.cen.getY(), fs, r: null }; }
      j.out = { x: got.x, y: got.y, fs: got.fs };
      if (got.r) placed.push(got.r);
    }
    for (const j of jobs) D.texts.push({ x: X(j.out.x), y: Y(j.out.y), lines: j.partsC, size: j.out.fs, code: j.st.code });
    // every numbered box on the sheet (for per-stand content such as exhibitor logos)
    const ringPts = p => tr(p.getExteriorRing().getCoordinates().map(c => [c.x, c.y]));
    D.boxes = ss.map(t => ({ code: t.code, pts: ringPts(t.poly) }));
    for (const j of freeJobs) if (!j.free) D.boxes.push({ code: j.code, pts: ringPts(j.poly) });
    return D;
  }

  return { typedCode, extraKey, survey, guessLayers, loadGeometry, guessBuilding, detect, guessPavilions, assign, layout, norm, pad, DEFAULT_RE, A3, MMPT, modelSpaceId };
})();
if (typeof module !== 'undefined') module.exports = FP;
