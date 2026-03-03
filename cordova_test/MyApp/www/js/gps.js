// GPS 模組
window['me'] = null;
window['my_gps_compass'] = {
    "items": {
        "mePIC": null,
        "meCompassPIC": null,
        "hasCOMPASS": false,
        "isCOMPASSFirstTime": true,
        "hasGPS": false,
        "mapObj": null,
        "gpsLon": null,
        "gpsLat": null,
        "compassAlpha": null, // 方向，0 - 360 度
        "lastSmoothAngle": null, // 新增：用來做平滑
        "lastEmitTime": 0,
        "lastEmitAngle": null,
    },
    "intervals": {
        "gpsInteval": null
    },

    "method": {
        /** ---------------------------------------------------------
         * GPS 設定
         * -------------------------------------------------------- */
        "setGPS": function (lon, lat) {
            lon = parseFloat(lon);
            lat = parseFloat(lat);
            if (window['me'] != null) {
                window['me'].setXY(new dgXY(lon, lat));
            }
            window['my_gps_compass'].items.gpsLon = lon;
            window['my_gps_compass'].items.gpsLat = lat;
        },

        /** ---------------------------------------------------------
         * Compass 設定（包含平滑）
         * -------------------------------------------------------- */
        "setCOMPASS": function (angleRaw) {
            let angle = parseFloat(angleRaw);
            const items = window['my_gps_compass'].items;
            const mapObj = items.mapObj;

            items.hasCOMPASS = true;

            // 修正角度 0~360
            angle = (angle % 360 + 360) % 360;
            items.compassAlpha = angle;

            // ===== 第一次啟動 Compass → 換 icon =====
            if (items.isCOMPASSFirstTime === true) {
                items.isCOMPASSFirstTime = false;
                window['me'].setIcon(items.meCompassPIC);
                window['me']._instance.getSource().getFeatures()[0]
                    .getStyle().getImage().setAnchor([0.5, 0.775]);
            }

            // ===== 方向平滑（防卡頓）=====
            let last = items.lastSmoothAngle;
            if (last == null) last = angle;
            const smooth = this.smoothHeading(last, angle);
            items.lastSmoothAngle = smooth;

            // ===== 實際旋轉 marker =====
            const mapRotation = (mapObj ? mapObj.rotate() : 0);
            const finalAngle = ((-1 * smooth) + mapRotation + 360) % 360;

            window['me'].setRotation(finalAngle);
        },

        /** ---------------------------------------------------------
         * 方向平滑，避免跳動卡頓
         * -------------------------------------------------------- */
        "smoothHeading": function (oldAngle, newAngle, factor = 0.15) {
            let diff = newAngle - oldAngle;

            // 確保採用最短旋轉路徑（避免跨 0/360 度跳 359 度）
            if (diff > 180) diff -= 360;
            if (diff < -180) diff += 360;

            return oldAngle + diff * factor;
        },

        /** ---------------------------------------------------------
         * 取得當前 GPS
         * -------------------------------------------------------- */
        "getGPS": function () {
            return {
                "lon": window['my_gps_compass'].items.gpsLon,
                "lat": window['my_gps_compass'].items.gpsLat
            };
        },

        /** ---------------------------------------------------------
         * 取得 Compass 角度
         * -------------------------------------------------------- */
        "getCOMPASS": function () {
            return window['my_gps_compass'].items.compassAlpha;
        },

        /* 判斷是否行動裝置 */
        "isMobile": function () {
            const uA = navigator.userAgent || navigator.vendor || window.opera;
            return /android|iPhone|iPad|iPod|opera mini|IEMobile|WPDesktop|blackberry/i.test(uA);
        },

        /** ---------------------------------------------------------
         * 初始化
         * -------------------------------------------------------- */
        "init": function (easymapObj, pic_me, pic_compass_me) {

            const items = window['my_gps_compass'].items;

            items.mapObj = easymapObj;
            items.mePIC = pic_me;
            items.meCompassPIC = pic_compass_me;

            // Map 上建立 marker
            if (window['me'] == null) {
                const icon = new dgIcon(items.mePIC, 50, 50);
                window['me'] = new dgMarker(new dgXY(0, 0), icon, false);

                items.mapObj.addItem(window['me']);

                window['me']._instance.getSource().getFeatures()[0]
                    .getStyle().getImage().setAnchor([0.5, 0.775]);

                items.mapObj.setZIndexTop(window['me']);
            }

            this.init_gps();
            this.init_compass();
        },

        /** ---------------------------------------------------------
         * GPS 監聽
         * -------------------------------------------------------- */
        "init_gps": function () {

            if (!("geolocation" in navigator)) return;

            const ctx = window['my_gps_compass'];
            const items = ctx.items;

            items._latestGPS = null;
            items._lastGPSEmitTime = 0;

            ctx.watchId = navigator.geolocation.watchPosition(
                (position) => {

                    items.hasGPS = true;

                    items._latestGPS = {
                        lat: position.coords.latitude,
                        lon: position.coords.longitude,
                        time: position.timestamp
                    };
                },
                (err) => { /* ignore */ },
                {
                    enableHighAccuracy: true,
                    timeout: 10 * 1000,
                    maximumAge: 0
                }
            );

            // === 每 10 秒才真正更新地圖 ===
            items._gpsTimer = setInterval(() => {

                if (!items._latestGPS) return;

                const now = Date.now();
                if (now - items._lastGPSEmitTime < 10000) return;

                items._lastGPSEmitTime = now;

                items.gpsLon = items._latestGPS.lon;
                items.gpsLat = items._latestGPS.lat;

                window['me'].setXY(
                    new dgXY(items.gpsLon, items.gpsLat)
                );

            }, 1000); // 每秒檢查一次即可
        },

        /** ---------------------------------------------------------
         * 啟動方向感應器 listener（只啟動一次）
         * -------------------------------------------------------- */
        "startDeviceOrientationListener": function () {

            const ctx = window['my_gps_compass'];
            if (ctx.__orientationStarted) return;
            ctx.__orientationStarted = true;

            const items = ctx.items;
            items._latestAngle = null;

            // === 接收裝置方向（高頻 OK）===
            window.addEventListener("deviceorientation", (event) => {
                let angle = null;

                if (event.webkitCompassHeading !== undefined) {
                    angle = event.webkitCompassHeading;
                } else if (event.alpha != null) {
                    angle = 360 - event.alpha;
                }

                if (angle == null) return;

                angle = (angle % 360 + 360) % 360;
                items._latestAngle = angle;
            });

            // === 每 2 秒才真正更新 UI ===
            items._compassTimer = setInterval(() => {

                if (items._latestAngle == null) return;

                // 可選：角度差太小就不動
                if (items.lastEmitAngle != null) {
                    let diff = items._latestAngle - items.lastEmitAngle;
                    if (diff > 180) diff -= 360;
                    if (diff < -180) diff += 360;

                    if (Math.abs(diff) < 10) return; // 10° 以下忽略
                }

                items.lastEmitAngle = items._latestAngle;
                ctx.method.setCOMPASS(items._latestAngle);

            }, 2000); // ← 2 秒（改 3000 就是 3 秒）
        },

        /** ---------------------------------------------------------
         * Compass 初始化
         * -------------------------------------------------------- */
        "init_compass": function () {

            if (typeof DeviceOrientationEvent === "undefined") return;

            // iOS 需要 requestPermission
            if (typeof DeviceOrientationEvent.requestPermission === "function") {
                DeviceOrientationEvent.requestPermission()
                    .then(state => {
                        if (state === "granted") {
                            this.startDeviceOrientationListener();
                        }
                    })
                    .catch(() => { });
            } else {
                // Android / 其他裝置
                this.startDeviceOrientationListener();
            }
        }
    }
};