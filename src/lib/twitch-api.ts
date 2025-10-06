import axios, { AxiosInstance, AxiosError } from 'axios';
import {
  TwitchUser,
  TwitchStream,
  TwitchEventSubSubscription,
} from './types';

export class TwitchAPIClient {
  private clientId: string;
  private clientSecret: string;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private axiosInstance: AxiosInstance;

  constructor(clientId: string, clientSecret: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.axiosInstance = axios.create({
      baseURL: 'https://api.twitch.tv/helix',
      timeout: 10000,
    });
  }

  /**
   * Get OAuth access token
   */
  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken as string;
    }

    try {
      const response = await axios.post(
        'https://id.twitch.tv/oauth2/token',
        null,
        {
          params: {
            client_id: this.clientId,
            client_secret: this.clientSecret,
            grant_type: 'client_credentials',
          },
        }
      );

      this.accessToken = response.data.access_token;
      // Set expiration to 5 minutes before actual expiration for safety
      this.tokenExpiresAt = Date.now() + (response.data.expires_in - 300) * 1000;
      
      return this.accessToken as string;
    } catch (error) {
      console.error('Failed to get Twitch access token:', error);
      throw error;
    }
  }

  /**
   * Make authenticated request to Twitch API
   */
  private async authenticatedRequest<T>(
    method: 'get' | 'post' | 'delete',
    path: string,
    data?: Record<string, unknown>,
    params?: Record<string, string | number | string[]>
  ): Promise<T> {
    const token = await this.getAccessToken();

    try {
      const response = await this.axiosInstance.request<T>({
        method,
        url: path,
        data,
        params,
        headers: {
          Authorization: `Bearer ${token}`,
          'Client-Id': this.clientId,
        },
      });

      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      console.error('Twitch API error:', {
        status: axiosError.response?.status,
        statusText: axiosError.response?.statusText,
        data: axiosError.response?.data,
        path,
        method,
      });
      throw error;
    }
  }

  /**
   * Get users by login names
   */
  async getUsersByLogin(logins: string[]): Promise<TwitchUser[]> {
    if (logins.length === 0) return [];
    
    const response = await this.authenticatedRequest<{ data: TwitchUser[] }>(
      'get',
      '/users',
      undefined,
      { login: logins }
    );

    return response.data;
  }

  /**
   * Get user by login name
   */
  async getUserByLogin(login: string): Promise<TwitchUser | null> {
    const users = await this.getUsersByLogin([login]);
    return users[0] || null;
  }

  /**
   * Get users by IDs
   */
  async getUsersByIds(ids: string[]): Promise<TwitchUser[]> {
    if (ids.length === 0) return [];
    
    const response = await this.authenticatedRequest<{ data: TwitchUser[] }>(
      'get',
      '/users',
      undefined,
      { id: ids }
    );

    return response.data;
  }

  /**
   * Get streams for user IDs
   */
  async getStreams(userIds: string[]): Promise<TwitchStream[]> {
    if (userIds.length === 0) return [];

    const response = await this.authenticatedRequest<{ data: TwitchStream[] }>(
      'get',
      '/streams',
      undefined,
      { user_id: userIds }
    );

    return response.data;
  }

  /**
   * Check if a user is currently streaming
   */
  async isStreaming(userId: string): Promise<TwitchStream | null> {
    const streams = await this.getStreams([userId]);
    return streams[0] || null;
  }

  /**
   * Get streams by user logins
   */
  async getStreamsByLogin(logins: string[]): Promise<TwitchStream[]> {
    if (logins.length === 0) return [];

    const response = await this.authenticatedRequest<{ data: TwitchStream[] }>(
      'get',
      '/streams',
      undefined,
      { user_login: logins }
    );

    return response.data;
  }

  /**
   * Create EventSub subscription
   */
  async createEventSubSubscription(
    type: string,
    version: string,
    condition: Record<string, string>,
    callbackUrl: string,
    secret: string
  ): Promise<TwitchEventSubSubscription> {
    const response = await this.authenticatedRequest<{
      data: TwitchEventSubSubscription[];
    }>('post', '/eventsub/subscriptions', {
      type,
      version,
      condition,
      transport: {
        method: 'webhook',
        callback: callbackUrl,
        secret,
      },
    });

    return response.data[0];
  }

  /**
   * Subscribe to stream.online event
   */
  async subscribeToStreamOnline(
    broadcasterUserId: string,
    callbackUrl: string,
    secret: string
  ): Promise<TwitchEventSubSubscription> {
    return this.createEventSubSubscription(
      'stream.online',
      '1',
      { broadcaster_user_id: broadcasterUserId },
      callbackUrl,
      secret
    );
  }

  /**
   * Subscribe to stream.offline event
   */
  async subscribeToStreamOffline(
    broadcasterUserId: string,
    callbackUrl: string,
    secret: string
  ): Promise<TwitchEventSubSubscription> {
    return this.createEventSubSubscription(
      'stream.offline',
      '1',
      { broadcaster_user_id: broadcasterUserId },
      callbackUrl,
      secret
    );
  }

  /**
   * Get all EventSub subscriptions
   */
  async getEventSubSubscriptions(): Promise<TwitchEventSubSubscription[]> {
    const response = await this.authenticatedRequest<{
      data: TwitchEventSubSubscription[];
      total: number;
    }>('get', '/eventsub/subscriptions');

    return response.data;
  }

  /**
   * Delete EventSub subscription
   */
  async deleteEventSubSubscription(subscriptionId: string): Promise<void> {
    await this.authenticatedRequest(
      'delete',
      '/eventsub/subscriptions',
      undefined,
      { id: subscriptionId }
    );
  }

  /**
   * Generate MultiTwitch URL for multiple channels
   */
  static generateMultiTwitchUrl(channelLogins: string[]): string {
    if (channelLogins.length === 0) return '';
    if (channelLogins.length === 1) {
      return `https://www.twitch.tv/${channelLogins[0]}`;
    }
    return `https://multitwitch.tv/${channelLogins.join('/')}`;
  }
}

// Singleton instance
let twitchClient: TwitchAPIClient | null = null;

export function getTwitchClient(): TwitchAPIClient {
  if (!twitchClient) {
    const clientId = process.env.TWITCH_CLIENT_ID;
    const clientSecret = process.env.TWITCH_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      throw new Error('TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET environment variables must be set');
    }
    
    twitchClient = new TwitchAPIClient(clientId, clientSecret);
  }
  return twitchClient;
}
