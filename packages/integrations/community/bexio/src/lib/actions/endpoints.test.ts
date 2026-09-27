import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTimeTrackingAction } from './create-time-tracking';
import { createProductAction } from './create-product';
import { updateProductAction } from './update-product';
import { BexioClient } from '../common/client';

vi.mock('../common/client', () => {
  return {
    BexioClient: vi.fn(),
  };
});

describe('Bexio Dropdown Endpoints & Error Handling', () => {
  const mockAuth = { access_token: 'fake-token' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createTimeTrackingAction', () => {
    it('timesheet status dropdown should call /2.0/timesheet_status and return options', async () => {
      const mockGet = vi.fn().mockResolvedValue([
        { id: 1, name: 'Open' },
        { id: 2, name: 'Done' },
      ]);
      (BexioClient as any).mockImplementation(() => ({
        get: mockGet,
      }));

      const statusProp = createTimeTrackingAction.props.status_id as any;
      const result = await statusProp.options({ auth: mockAuth });

      expect(mockGet).toHaveBeenCalledWith('/2.0/timesheet_status');
      expect(result.disabled).toBe(false);
      expect(result.options).toEqual([
        { label: 'Open', value: 1 },
        { label: 'Done', value: 2 },
      ]);
    });

    it('timesheet status dropdown should return diagnostic placeholder on failure instead of empty options', async () => {
      const mockGet = vi.fn().mockRejectedValue(new Error('Network error'));
      (BexioClient as any).mockImplementation(() => ({
        get: mockGet,
      }));

      const statusProp = createTimeTrackingAction.props.status_id as any;
      const result = await statusProp.options({ auth: mockAuth });

      expect(result.disabled).toBe(true);
      expect(result.placeholder).toBe('Connection test failed: Network error');
      expect(result.options).toEqual([]);
    });

    it('client service dropdown should call /2.0/client_service and return options', async () => {
      const mockGet = vi
        .fn()
        .mockResolvedValue([{ id: 10, name: 'Consulting' }]);
      (BexioClient as any).mockImplementation(() => ({
        get: mockGet,
      }));

      const serviceProp = createTimeTrackingAction.props
        .client_service_id as any;
      const result = await serviceProp.options({ auth: mockAuth });

      expect(mockGet).toHaveBeenCalledWith('/2.0/client_service');
      expect(result.disabled).toBe(false);
      expect(result.options).toEqual([{ label: 'Consulting', value: 10 }]);
    });

    it('client service dropdown should return diagnostic placeholder on failure', async () => {
      const mockGet = vi.fn().mockRejectedValue(new Error('API 500'));
      (BexioClient as any).mockImplementation(() => ({
        get: mockGet,
      }));

      const serviceProp = createTimeTrackingAction.props
        .client_service_id as any;
      const result = await serviceProp.options({ auth: mockAuth });

      expect(result.disabled).toBe(true);
      expect(result.placeholder).toBe('Connection test failed: API 500');
      expect(result.options).toEqual([]);
    });
  });

  describe('createProductAction', () => {
    it('stock dropdown should call /2.0/stock and return options', async () => {
      const mockGet = vi
        .fn()
        .mockResolvedValue([{ id: 100, name: 'Main Warehouse' }]);
      (BexioClient as any).mockImplementation(() => ({
        get: mockGet,
      }));

      const stockProp = createProductAction.props.stock_id as any;
      const result = await stockProp.options({ auth: mockAuth });

      expect(mockGet).toHaveBeenCalledWith('/2.0/stock');
      expect(result.disabled).toBe(false);
      expect(result.options).toEqual([{ label: 'Main Warehouse', value: 100 }]);
    });

    it('stock dropdown should return diagnostic placeholder on failure', async () => {
      const mockGet = vi.fn().mockRejectedValue(new Error('Unauthorized'));
      (BexioClient as any).mockImplementation(() => ({
        get: mockGet,
      }));

      const stockProp = createProductAction.props.stock_id as any;
      const result = await stockProp.options({ auth: mockAuth });

      expect(result.disabled).toBe(true);
      expect(result.placeholder).toBe('Connection test failed: Unauthorized');
      expect(result.options).toEqual([]);
    });

    it('stock place dropdown should call /2.0/stock_place and return options', async () => {
      const mockGet = vi.fn().mockResolvedValue([{ id: 200, name: 'Aisle 3' }]);
      (BexioClient as any).mockImplementation(() => ({
        get: mockGet,
      }));

      const placeProp = createProductAction.props.stock_place_id as any;
      const result = await placeProp.options({ auth: mockAuth });

      expect(mockGet).toHaveBeenCalledWith('/2.0/stock_place');
      expect(result.disabled).toBe(false);
      expect(result.options).toEqual([{ label: 'Aisle 3', value: 200 }]);
    });

    it('article group dropdown should call /2.0/article_group and return options', async () => {
      const mockGet = vi
        .fn()
        .mockResolvedValue([{ id: 300, name: 'Hardware' }]);
      (BexioClient as any).mockImplementation(() => ({
        get: mockGet,
      }));

      const groupProp = createProductAction.props.article_group_id as any;
      const result = await groupProp.options({ auth: mockAuth });

      expect(mockGet).toHaveBeenCalledWith('/2.0/article_group');
      expect(result.disabled).toBe(false);
      expect(result.options).toEqual([{ label: 'Hardware', value: 300 }]);
    });
  });

  describe('updateProductAction', () => {
    it('update product stock, stock_place and article_group dropdowns call verified endpoints', async () => {
      const mockGet = vi.fn().mockImplementation((endpoint: string) => {
        if (endpoint === '/2.0/stock')
          return Promise.resolve([{ id: 1, name: 'Warehouse' }]);
        if (endpoint === '/2.0/stock_place')
          return Promise.resolve([{ id: 2, name: 'Shelf B' }]);
        if (endpoint === '/2.0/article_group')
          return Promise.resolve([{ id: 3, name: 'Electronics' }]);
        return Promise.reject(new Error('Unknown endpoint'));
      });
      (BexioClient as any).mockImplementation(() => ({
        get: mockGet,
      }));

      const stockRes = await (
        updateProductAction.props.stock_id as any
      ).options({ auth: mockAuth });
      const placeRes = await (
        updateProductAction.props.stock_place_id as any
      ).options({ auth: mockAuth });
      const groupRes = await (
        updateProductAction.props.article_group_id as any
      ).options({ auth: mockAuth });

      expect(stockRes.disabled).toBe(false);
      expect(placeRes.disabled).toBe(false);
      expect(groupRes.disabled).toBe(false);
      expect(mockGet).toHaveBeenCalledWith('/2.0/stock');
      expect(mockGet).toHaveBeenCalledWith('/2.0/stock_place');
      expect(mockGet).toHaveBeenCalledWith('/2.0/article_group');
    });
  });
});
