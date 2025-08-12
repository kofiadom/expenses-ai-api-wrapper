import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { DocumentReaderType } from '../../../utils/types';

export class ProcessDocumentDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: ' document file to process (PDF, PNG, JPG, JPEG)',
    example: '-report.pdf',
  })
  file: Express.Multer.File;

  @ApiProperty({
    description: 'User ID for processing context',
    example: 'user123',
    type: String,
  })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({
    description: 'Language for processing (default: en)',
    example: 'en',
    enum: ['en', 'he'],
    default: 'en',
    required: false,
  })
  @IsString()
  @IsOptional()
  language?: string;

  @ApiProperty({
    description: 'Document reader to use for content extraction',
    example: 'llamaparse',
    enum: Object.values(DocumentReaderType),
    default: 'llamaparse',
    required: false,
  })
  @IsEnum(DocumentReaderType)
  @IsOptional()
  documentReader?: DocumentReaderType;
}

export class ProcessDocumentResponseDto {
  @ApiProperty({
    description: 'Success status',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Response message',
    example: 'Document processing job created successfully',
  })
  message: string;

  @ApiProperty({
    description: 'Job data',
    example: {
      jobId: 'job_123456789',
      status: 'waiting',
      createdAt: '2025-01-15T10:30:00Z',
    },
  })
  data: {
    jobId: string;
    status: string;
    createdAt: string;
  };
}
