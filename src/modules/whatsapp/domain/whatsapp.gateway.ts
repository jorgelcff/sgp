export interface WhatsappGateway {
  sendText(phone: string, message: string): Promise<string | null>;
  sendImage(
    phone: string,
    imageUrl: string,
    caption?: string,
  ): Promise<string | null>;
}
