import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/decorators';
import { SubmitDocumentDto } from './kyc.dto';
import { KycService } from './kyc.service';

@ApiTags('KYC')
@ApiBearerAuth()
@Controller('kyc')
export class KycController {
  constructor(private readonly kyc: KycService) {}

  @Post('documents')
  submit(@CurrentUser() user: AuthUser, @Body() dto: SubmitDocumentDto) {
    return this.kyc.submit(user.id, dto);
  }

  @Get('status')
  async status(@CurrentUser() user: AuthUser) {
    const [evaluation, documents] = await Promise.all([this.kyc.evaluate(user.id), this.kyc.listForUser(user.id)]);
    return { ...evaluation, documents };
  }
}
