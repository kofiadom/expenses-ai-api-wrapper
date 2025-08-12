import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { InvoiceSplitterService } from './invoice-splitter.service';
import { InvoiceSplitterAgent } from './agents/invoice-splitter.agent';

describe('InvoiceSplitterService', () => {
  let service: InvoiceSplitterService;
  let mockAgent: jest.Mocked<InvoiceSplitterAgent>;
  let mockConfigService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const mockAgentImplementation = {
      analyzePages: jest.fn(),
    };

    const mockConfigImplementation = {
      get: jest.fn().mockReturnValue('./uploads'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceSplitterService,
        {
          provide: InvoiceSplitterAgent,
          useValue: mockAgentImplementation,
        },
        {
          provide: ConfigService,
          useValue: mockConfigImplementation,
        },
      ],
    }).compile();

    service = module.get<InvoiceSplitterService>(InvoiceSplitterService);
    mockAgent = module.get(InvoiceSplitterAgent);
    mockConfigService = module.get(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should have cleanup method', () => {
    expect(service.cleanupTempFiles).toBeDefined();
    expect(typeof service.cleanupTempFiles).toBe('function');
  });

  it('should create temp directory path correctly', () => {
    const service = new InvoiceSplitterService(mockAgent, mockConfigService);
    expect(mockConfigService.get).toHaveBeenCalledWith('UPLOAD_PATH', './uploads');
  });

  // Note: Full integration tests would require actual PDF files and LLM API access
  // This is a basic structure test to ensure the service is properly configured
});
