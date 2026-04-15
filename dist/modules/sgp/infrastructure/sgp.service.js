"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var SgpService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SgpService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = require("@nestjs/axios");
const rxjs_1 = require("rxjs");
let SgpService = SgpService_1 = class SgpService {
    constructor(httpService) {
        this.httpService = httpService;
        this.logger = new common_1.Logger(SgpService_1.name);
    }
    async fetchClientsPage(offset, limit) {
        const response = await (0, rxjs_1.firstValueFrom)(this.httpService.post("/clientes", {
            offset,
            limit,
        }));
        this.logger.log(`Requisicao SGP: offset=${offset}, limit=${limit}, status=${response.status}`);
        return response.data;
    }
    async fetchPortador() {
        const response = await (0, rxjs_1.firstValueFrom)(this.httpService.get("/portador", {}));
        if (response.status === 200) {
            return true;
        }
        return false;
    }
    async ping() {
        try {
            return await this.fetchPortador();
        }
        catch (error) {
            this.logger.warn(`Falha ao pingar SGP: ${getErrorMessage(error)}`);
            return false;
        }
    }
};
exports.SgpService = SgpService;
exports.SgpService = SgpService = SgpService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [axios_1.HttpService])
], SgpService);
function getErrorMessage(error) {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}
//# sourceMappingURL=sgp.service.js.map