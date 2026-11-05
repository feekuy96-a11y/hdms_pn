self.onmessage = (event) => {
  try {
    const simplify = (points, tolerance) => {
      if (points.length <= 2) return points;
      const keep = new Uint8Array(points.length);
      keep[0] = keep[points.length - 1] = 1;
      const ranges = [[0, points.length - 1]];
      while (ranges.length) {
        const [start, end] = ranges.pop();
        const a = points[start], b = points[end];
        const dx = b[0] - a[0], dy = b[1] - a[1], magnitude = Math.hypot(dx, dy);
        let farthest = tolerance, selected = -1;
        for (let i = start + 1; i < end; i++) {
          const p = points[i];
          const distance = magnitude === 0 ? Math.hypot(p[0] - a[0], p[1] - a[1]) : Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / magnitude;
          if (distance > farthest) { farthest = distance; selected = i; }
        }
        if (selected >= 0) { keep[selected] = 1; ranges.push([start, selected], [selected, end]); }
      }
      return points.filter((_, index) => keep[index] === 1);
    };
    self.postMessage({ features: event.data.features.map((feature) => ({ ...feature, coords: simplify(feature.coords, event.data.tolerance) })) });
  } catch {
    self.postMessage({ error: "ไม่สามารถลดจำนวนจุดเส้นทางได้" });
  }
};
