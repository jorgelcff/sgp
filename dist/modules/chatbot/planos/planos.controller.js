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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanosController = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const platform_express_1 = require("@nestjs/platform-express");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
let PlanosController = class PlanosController {
    constructor(configService) {
        this.configService = configService;
    }
    async getPlanImage(res) {
        const filePath = this.getPlanImagePath();
        try {
            await node_fs_1.promises.access(filePath);
        }
        catch {
            throw new common_1.NotFoundException("Imagem de planos nao encontrada.");
        }
        res.sendFile(filePath);
    }
    async uploadPlanImage(file) {
        if (!file) {
            throw new common_1.BadRequestException("Arquivo nao enviado.");
        }
        if (!file.mimetype?.startsWith("image/")) {
            throw new common_1.BadRequestException("Apenas arquivos de imagem sao permitidos.");
        }
        const filePath = this.getPlanImagePath();
        await node_fs_1.promises.mkdir((0, node_path_1.dirname)(filePath), { recursive: true });
        await node_fs_1.promises.writeFile(filePath, file.buffer);
        return { url: this.buildPublicUrl() };
    }
    getPlanImagePath() {
        return (0, node_path_1.resolve)(process.cwd(), "assets", "planos.jpeg");
    }
    buildPublicUrl() {
        const baseUrl = this.configService.get("APP_BASE_URL");
        if (!baseUrl) {
            return "/assets/planos.jpeg";
        }
        const cleanBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
        return `${cleanBase}/assets/planos.jpeg`;
    }
};
exports.PlanosController = PlanosController;
__decorate([
    (0, common_1.Get)("imagem"),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PlanosController.prototype, "getPlanImage", null);
__decorate([
    (0, common_1.Post)("imagem"),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)("file")),
    __param(0, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PlanosController.prototype, "uploadPlanImage", null);
exports.PlanosController = PlanosController = __decorate([
    (0, common_1.Controller)("planos"),
    __metadata("design:paramtypes", [config_1.ConfigService])
], PlanosController);
//# sourceMappingURL=planos.controller.js.map