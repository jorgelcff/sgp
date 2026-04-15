"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SgpModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = require("@nestjs/axios");
const sgp_service_1 = require("./infrastructure/sgp.service");
let SgpModule = class SgpModule {
};
exports.SgpModule = SgpModule;
exports.SgpModule = SgpModule = __decorate([
    (0, common_1.Module)({
        imports: [
            axios_1.HttpModule.registerAsync({
                inject: [config_1.ConfigService],
                useFactory: (configService) => {
                    const baseURL = configService.get("SGP_URL");
                    const user = configService.get("SGP_USER");
                    const pass = configService.get("SGP_PASS");
                    const headers = {};
                    if (user && pass) {
                        const basic = Buffer.from(`${user}:${pass}`).toString("base64");
                        headers.Authorization = `Basic ${basic}`;
                    }
                    else if (pass) {
                        headers.Authorization = `Bearer ${pass}`;
                    }
                    const timeoutMs = Number(configService.get("SGP_TIMEOUT_MS") ?? 60000);
                    return {
                        baseURL,
                        headers,
                        timeout: Number.isNaN(timeoutMs) ? 60000 : timeoutMs,
                    };
                },
            }),
        ],
        providers: [sgp_service_1.SgpService],
        exports: [sgp_service_1.SgpService],
    })
], SgpModule);
//# sourceMappingURL=sgp.module.js.map