import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class SplitRequestDto {
  @ApiProperty({
    description: 'Document reader (textract is used automatically for optimal page detection)',
    enum: ['textract'],
    default: 'textract',
    required: false,
  })
  @IsOptional()
  @IsString()
  documentReader?: string;
}
