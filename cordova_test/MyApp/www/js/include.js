function my_fix_random() {
    //var array = new Uint32Array(1);
    //var v = window.crypto.getRandomValues(array)[0];
    //return parseFloat((v / (Math.pow(10, v.toString().length))).toFixed(10));    
    var crypto = window.crypto /*native*/ || window.msCrypto /*IE11 native*/ || window.msrCrypto; /*polyfill*/
    return parseFloat(((new Uint32Array(1))[0] / 4294967295).toString(36).substring(2, 15) + (crypto.getRandomValues(new Uint32Array(1))[0] / 4294967295));
}
function rand(min, max) {
    var argc = arguments.length; if (argc === 0) { min = 0; max = 2147483647; } else if (argc === 1) { throw new Error('Warning: rand() expects exactly 2 parameters, 1 given'); }
    return Math.floor(my_fix_random() * (max - min + 1)) + min;
}
function arduino_map(x, in_min, in_max, out_min, out_max) {
    //x = 輸入值
    //in 如 0~255
    //out 如 0~1024
    return (x - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
}
function drawPolygonWKT(wktstr, start_z, end_z, opt = null) {
    // 移除前後空白
    wktstr = wktstr.trim();

    // 如果是 GEOMETRYCOLLECTION
    if (/^GEOMETRYCOLLECTION/i.test(wktstr)) {
        // 把 GEOMETRYCOLLECTION(...) 裡的東西取出
        const inner = wktstr.replace(/^GEOMETRYCOLLECTION\s*\(/i, "").replace(/\)$/, "").trim();

        // 簡單拆子 WKT（只考慮 POLYGON，不支援巢狀括號解析）
        const parts = [];
        let depth = 0,
            start = 0;
        for (let i = 0; i < inner.length; i++) {
            const ch = inner[i];
            if (ch === "(") depth++;
            else if (ch === ")") depth--;

            if (ch === "," && depth === 0) {
                parts.push(inner.substring(start, i).trim());
                start = i + 1;
            }
        }
        parts.push(inner.substring(start).trim());

        const entities = [];
        parts.forEach(p => {
            if (/^POLYGON/i.test(p)) {
                const e = drawPolygonWKT(p, start_z, end_z, opt); // 遞迴呼叫
                if (e) entities.push(e);
            }
            // 你如果想支援 LINESTRING 也能在這裡加
        });
        return entities[0]; // 回傳陣列
    }

    // ========= 處理 POLYGON =========
    if (/^POLYGON/i.test(wktstr)) {
        const coordsText = wktstr
            .replace(/POLYGON\s*\(\(\s*/i, "")
            .replace(/\)\)/, "")
            .trim();

        const coords = coordsText.split(",").map(s => {
            const [lon, lat] = s.trim().split(/\s+/).map(Number);
            return [lon, lat];
        }).filter(([lon, lat]) => !isNaN(lon) && !isNaN(lat));

        if (coords.length < 3) {
            console.warn("Polygon 點數不足，跳過:", wktstr);
            return null;
        }

        const flat = [];
        coords.forEach(([lon, lat]) => {
            flat.push(lon, lat, start_z);
        });

        const hierarchyPositions = Cesium.Cartesian3.fromDegreesArrayHeights(flat);
        const floors = end_z / 3.5;
        const color = floors > 20 ? Cesium.Color.RED.withAlpha(0.8) :
            floors > 10 ? Cesium.Color.ORANGE.withAlpha(0.8) :
                Cesium.Color.fromBytes(255, 255, 255, 150);
        const entity = {
            polygon: {
                hierarchy: hierarchyPositions,
                material: color,
                height: start_z,
                extrudedHeight: end_z,
                outline: true,
                outlineColor: Cesium.Color.BLACK,
                closeTop: true,
                closeBottom: true
            }
        };
        if (opt != null && typeof (opt.polygon) == "object") {
            for (var k in opt.polygon) {
                entity.polygon[k] = opt.polygon[k];
            }
        }

        var w = window['viewer'].entities.add(entity);
        if (opt != null && typeof (opt.easydata) == "object") {
            w.easydata = {};
            for (var k in opt.easydata) {
                w.easydata[k] = opt.easydata[k];
            }
        }
        return w;
    }

    console.warn("不支援的 WKT:", wktstr);
    return null;
}