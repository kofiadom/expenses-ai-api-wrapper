import {
  Controller,
  Post,
  Delete,
  Param,
  UploadedFile,
  UseInterceptors,
  Body,
  HttpStatus,
  HttpException,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { InvoiceSplitterService } from './invoice-splitter.service';
import { SplitRequestDto } from './dto/split-request.dto';
import { SplitAnalysisResponseDto } from './dto/split-response.dto';

@ApiTags('invoice-splitter')
@Controller('invoice-splitter')
export class InvoiceSplitterController {
  constructor(private readonly invoiceSplitterService: InvoiceSplitterService) {}

  @Post('analyze')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
      },
      fileFilter: (req, file, cb) => {
        const allowedMimes = [
          'application/pdf',
        ];
        if (allowedMimes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new Error(
              'Invalid file type. Only PDF files are allowed for invoice splitting.'
            ),
            false
          );
        }
      },
    })
  )
  @UsePipes(new ValidationPipe({ transform: true }))
  @ApiOperation({
    summary: 'Analyze document for multiple invoices and split into separate files',
    description: `
    Upload a PDF document to analyze if it contains multiple invoices. The service will:
    1. Extract each page as markdown using the specified document reader
    2. Use LLM analysis to identify invoice boundaries and group pages
    3. Create separate PDF files for each detected invoice
    4. Return combined markdown content and PDF file paths for each invoice
    
    This is useful for processing multi-invoice documents where invoices need to be handled separately.
    `,
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'PDF document upload with analysis parameters',
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'PDF document file (max 50MB)',
        },
        documentReader: {
          type: 'string',
          description: 'Document reader (textract is used automatically for optimal page detection)',
          enum: ['textract'],
          example: 'textract',
          default: 'textract',
        },
      },
      required: ['file'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Document analysis completed successfully',
    type: SplitAnalysisResponseDto,
    schema: {
      example: {
        success: true,
        data: {
          originalFileName: 'multi_invoices.pdf',
          totalPages: 5,
          hasMultipleInvoices: true,
          totalInvoices: 2,
          invoices: [
            {
              invoiceNumber: 1,
              pages: [1, 2],
              content: '# Page 1\n\nINVOICE #INV-001...\n\n---\n\n# Page 2\n\nContinued...',
              confidence: 0.95,
              reasoning: 'Pages 1-2: Invoice #INV-001 from Company A',
              totalPages: 2,
              pdfPath: '/temp/invoice-splits/1640995200000/invoice_1.pdf',
              fileName: 'invoice_1.pdf',
              fileSize: 45823
            },
            {
              invoiceNumber: 2,
              pages: [3, 4, 5],
              content: '# Page 3\n\nINVOICE #INV-002...',
              confidence: 0.88,
              reasoning: 'Pages 3-5: Invoice #INV-002 from Company B',
              totalPages: 3,
              pdfPath: '/temp/invoice-splits/1640995200000/invoice_2.pdf',
              fileName: 'invoice_2.pdf',
              fileSize: 67234
            }
          ],
          tempDirectory: '/temp/invoice-splits/1640995200000'
        }
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid file or request parameters',
    schema: {
      example: {
        success: false,
        message: 'Invalid file type. Only PDF files are allowed for invoice splitting.',
        statusCode: 400,
        timestamp: '2025-01-15T10:30:00Z',
        path: '/invoice-splitter/analyze',
      },
    },
  })
  @ApiResponse({
    status: 413,
    description: 'File too large (max 50MB)',
    schema: {
      example: {
        success: false,
        message: 'File size exceeds the 50MB limit',
        statusCode: 413,
        timestamp: '2025-01-15T10:30:00Z',
        path: '/invoice-splitter/analyze',
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error during analysis',
    schema: {
      example: {
        success: false,
        message: 'Invoice analysis failed: LLM service unavailable',
        statusCode: 500,
        timestamp: '2025-01-15T10:30:00Z',
        path: '/invoice-splitter/analyze',
      },
    },
  })
  async analyzeDocument(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: SplitRequestDto
  ) {
    if (!file) {
      throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    }

    try {
      const result = await this.invoiceSplitterService.analyzeAndSplitDocument(file, {
        documentReader: 'textract', // Always use textract for optimal page detection
      });

      return result;
    } catch (error) {
      throw new HttpException(
        `Invoice analysis failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Delete('cleanup/:tempDirectory')
  @ApiOperation({
    summary: 'Clean up temporary files from invoice splitting',
    description: `
    Clean up temporary directory and files created during invoice splitting process.
    The tempDirectory parameter should be the directory name (not full path) returned 
    from the analyze endpoint. This is useful for manual cleanup or can be called 
    after processing the split invoices.
    `,
  })
  @ApiParam({
    name: 'tempDirectory',
    description: 'Temporary directory name to clean up (from analyze response)',
    example: '1640995200000',
  })
  @ApiResponse({
    status: 200,
    description: 'Temporary files cleaned up successfully',
    schema: {
      example: {
        success: true,
        message: 'Temporary files cleaned up successfully',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid directory parameter',
    schema: {
      example: {
        success: false,
        message: 'Invalid temp directory parameter',
        statusCode: 400,
      },
    },
  })
  async cleanupTempFiles(@Param('tempDirectory') tempDirectory: string) {
    if (!tempDirectory || tempDirectory.includes('..') || tempDirectory.includes('/')) {
      throw new HttpException(
        'Invalid temp directory parameter',
        HttpStatus.BAD_REQUEST
      );
    }

    try {
      // Reconstruct full temp directory path
      const fullTempPath = `uploads/invoice-splits/${tempDirectory}`;
      await this.invoiceSplitterService.cleanupTempFiles(fullTempPath);

      return {
        success: true,
        message: 'Temporary files cleaned up successfully',
      };
    } catch (error) {
      throw new HttpException(
        `Cleanup failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
