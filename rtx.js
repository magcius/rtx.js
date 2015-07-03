(function(exports) {

    function dot3(a, b) {
        return a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
    }
    function add3(a, b) {
        return [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
    }
    function sub3(a, b) {
        return [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
    }
    function mul3(a, b) {
        return [a[0]*b, a[1]*b, a[2]*b];
    }
    function mul3v(a, b) {
        return [a[0]*b[0], a[1]*b[1], a[2]*b[2]];
    }
    function mag3(a) {
        return Math.sqrt(a[0]*a[0] + a[1]*a[1] + a[2]*a[2]);
    }
    function nrm3(a) {
        var d = mag3(a);
        a[0] /= d; a[1] /= d; a[2] /= d;
        return a;
    }
    function addc(a, b) {
        a[0] += b[0]; a[1] += b[1]; a[2] += b[2];
    }
    function crs3(a, b) {
        return [
            a[1]*b[2] - a[2]*b[1],
            a[2]*b[0] - a[0]*b[2],
            a[0]*b[1] - a[1]*b[0],
        ];
    }

    function hitPlane(ray, pln) {
        var denom = dot3(ray.d, pln.n);
        if (denom > 0)
            return null;

        var pos = sub3(ray.v, pln.v);
        var z = dot3(pos, pln.n) / -denom;
        var p = add3(mul3(ray.d, z), ray.v);
        return { obj: pln, ray: ray, z: z, p: p, n: pln.n };
    }
    function hitSphere(ray, sph) {
        var L = sub3(sph.v, ray.v);
        var t = dot3(L, ray.d);
        var d2 = sph.rad2 - (dot3(L, L) - t*t);
        if (d2 < 0)
            return null;

        var z = t - Math.sqrt(d2);
        var p = add3(mul3(ray.d, z), ray.v);
        var n = nrm3(sub3(p, sph.v));
        return { obj: sph, ray: ray, z: z, p: p, n: n };
    }
    function hitObject(scene, ray) {
        var MIS = { z: Infinity }, mis = MIS;
        for (var i = 0; i < scene.obj.length; i++) {
            var obj = scene.obj[i];
            var is = obj.hit(ray, obj);
            if (is && is.z < mis.z)
                mis = is;
        }
        if (mis === MIS) return null;
        return mis;
    }

    function castRay(scene, x, y) {
        var eye = scene.eye;
        var fov = scene.fov;
        var ray = { v: eye.v };
        ray.d = add3(add3(mul3(eye.rgt, fov*x), mul3(eye.upv, fov*y)), eye.fwd);
        nrm3(ray.d);
        return hitObject(scene, ray);
    }

    function shadeChecker(is) {
        var p = is.p;
        if ((Math.floor(p[0]) + Math.floor(p[2])) % 2 !== 0)
            return [1,1,1,1];
        else
            return [0,0,0,1];
    }
    function shadeSolid(is) {
        return [0.5, 0.8, 0.5, 1];
    }

    var SKY = [.3, .5, .8, 1];
    function shade(scene, is) {
        if (!is)
            return SKY;

        var srd = nrm3(sub3(is.ray.d, mul3(is.n, dot3(is.n, is.ray.d)*2)));
        var sc = is.obj.shade(is);

        var c = [0, 0, 0, 1];

        // global lighting
        addc(c, mul3(sc, .2));

        scene.lit.forEach(function(L) {
            var d = sub3(L.v, is.p);
            var mag = mag3(d);
            nrm3(d);
            var nis = hitObject(scene, { v: is.p, d: d });
            if (nis && nis.obj != is.obj && nis.z < mag)
                return;

            var idif = dot3(d, is.n);
            if (idif > 0) {
                var ndif = idif * L.i;
                var cdif = mul3v(sc, mul3(L.c, idif));
                addc(c, cdif);
            }
            var ispc = dot3(d, srd);
            if (ispc > 0) {
                var nspc = Math.pow(ispc, 150 / L.i);
                var cspc = mul3v(sc, mul3(L.c, nspc));
                addc(c, cspc);
            }
        });
        return c;
    }

    function castRays(ctx, scene) {
        var W = ctx.canvas.width, H = ctx.canvas.height;
        var aspect = W/H;
        var AA = 2, AA_NS = AA*AA;

        function castRayS(X, Y) {
            var x =  ((X / (W-1)) * 2 - 1) * aspect;
            var y = -((Y / (H-1)) * 2 - 1);
            var is = castRay(scene, x, y);
            return shade(scene, is);
        }
        function castRayAA(xx, yy) {
            var pv = [0, 0, 0];
            for (var ay = 0; ay < AA; ay++) {
                for (var ax = 0; ax < AA; ax++) {
                    var X = xx + (ax / AA);
                    var Y = yy + (ay / AA);
                    addc(pv, castRayS(X, Y));
                }
            }
            pv[0] /= AA_NS;
            pv[1] /= AA_NS;
            pv[2] /= AA_NS;
            return pv;
        }

        var img = ctx.getImageData(0, 0, W, H);
        var id = img.data;
        for (var yy = 0; yy < H; yy++) {
            for (var xx = 0; xx < W; xx++) {
                var pv = castRayAA(xx, yy);
                var o = ((yy * W) + xx) * 4;
                id[o+0] = pv[0] * 255;
                id[o+1] = pv[1] * 255;
                id[o+2] = pv[2] * 255;
                id[o+3] = 255;
            }
        }
        ctx.putImageData(img, 0, 0);
    }

    function _eye(v, la) {
        var eye = { v: v, la: la };
        eye.fwd = nrm3(sub3(la, v));
        eye.rgt = nrm3(crs3(eye.fwd, [0, -1, 0]));
        eye.upv = nrm3(crs3(eye.fwd, eye.rgt));
        return eye;
    }

    window.onload = function() {
        var canvas = document.querySelector('canvas');
        var ctx = canvas.getContext('2d');
        var eye = _eye([3,3,3], [0,.5,0]);
        var scene = { eye: eye, fov: 1.5 };
        scene.obj = [
            { hit: hitPlane,  shade: shadeChecker, v: [0,0,0], n: [0,1,0] },
            { hit: hitSphere, shade: shadeSolid,   v: [0,2,0], rad2: 3 }
        ];
        scene.lit = [
            { v: [2,5,1], c: [1,.5,.5], i: 20 }
        ];
        castRays(ctx, scene);
    };

})(window);
