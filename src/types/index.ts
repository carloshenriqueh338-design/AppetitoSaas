export type BusinessHours = {
  [day: string]: { open: string; close: string; closed: boolean } | undefined;
};

export type DeliveryZoneConfig = {
  id?: string;
  name: string;
  description?: string;
  delivery_fee: number;
  estimated_minutes: number;
  is_active: boolean;
  sort_order: number;
};

export type Restaurant = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  phone: string | null;
  address: string | null;
  logo_url: string | null;
  hero_url: string | null;
  primary_color: string;
  accent_color: string;
  is_open: boolean;
  subscription_status: string;
  created_at: string;
  whatsapp: string | null;
  instagram: string | null;
  business_hours: BusinessHours | Record<string, never>;
  closed_days: string[];
  currency: string;
  minimum_order: number;
  estimated_prep_minutes: number;
  delivery_enabled: boolean;
  pickup_enabled: boolean;
  table_ordering_enabled: boolean;
  delivery_fee: number;
  delivery_minimum_order: number;
  delivery_estimated_minutes: number;
  delivery_zones: DeliveryZoneConfig[];
};

export type Category = {
  id: string;
  restaurant_id: string;
  name: string;
  sort_order: number;
};

export type Modifier = {
  id: string;
  product_id: string;
  name: string;
  price_delta: number;
};

export type Product = {
  id: string;
  restaurant_id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  is_available: boolean;
  sort_order: number;
  modifiers?: Modifier[];
};

export type StaffRole = 'Owner' | 'Manager' | 'Staff' | 'Kitchen' | 'Driver';

export type Staff = {
  id: string;
  restaurant_id: string;
  name: string;
  role: StaffRole;
  pin: string | null;
};

export type OrderStatus =
  | 'new'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'completed'
  | 'canceled'
  | 'rejected'
  | 'payment_failed';
export type Fulfillment = 'delivery' | 'table';
export type PaymentMode = 'pay_now' | 'pay_later';
export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'paid'
  | 'failed'
  | 'expired'
  | 'canceled'
  | 'refunded'
  | 'partially_refunded';

export type PaymentMethod = 'pix' | 'card';

export type Payment = {
  id: string;
  order_id: string;
  provider: string;
  provider_payment_id: string | null;
  amount: number;
  currency: string;
  status: PaymentStatus;
  method: PaymentMethod | null;
  provider_metadata: {
    pix_qr_code?: string;
    pix_copy_paste?: string;
    pix_expires_at?: number;
    client_secret?: string;
    stripe_payment_intent_id?: string;
  } | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
  paid_at: string | null;
};

export type PaymentSession = {
  success: boolean;
  payment_id: string;
  provider_payment_id?: string;
  client_secret?: string;
  method: PaymentMethod;
  metadata: {
    pix_qr_code?: string;
    pix_copy_paste?: string;
    pix_expires_at?: number;
    client_secret?: string;
    stripe_payment_intent_id?: string;
  } | null;
  error?: string;
  message?: string;
};

export type PaymentStatusResult = {
  has_payment: boolean;
  payment_id?: string;
  status?: PaymentStatus;
  method?: PaymentMethod;
  metadata?: Payment['provider_metadata'];
  failure_reason?: string | null;
  paid_at?: string | null;
};
export type SubscriptionStatus = 'active' | 'trial' | 'suspended' | 'canceled' | 'trialing' | 'past_due' | 'paused' | 'expired';

export type FeatureLimits = {
  max_staff?: number;
  max_products?: number;
  max_orders_per_month?: number;
  max_locations?: number;
  advanced_analytics?: boolean;
  delivery_features?: boolean;
  kitchen_display?: boolean;
  priority_support?: boolean;
};

export type Plan = {
  id: string;
  name: string;
  description: string | null;
  monthly_price: number;
  yearly_price: number;
  trial_duration_days: number;
  is_active: boolean;
  sort_order: number;
  feature_limits: FeatureLimits;
  created_at: string;
  updated_at: string;
};

export type SubscriptionInfo = {
  has_subscription: boolean;
  subscription_id?: string;
  effective_status: SubscriptionStatus;
  plan_id?: string;
  plan_name: string;
  billing_cycle?: 'monthly' | 'yearly';
  feature_limits: FeatureLimits;
  monthly_price?: number;
  yearly_price?: number;
  start_date?: string;
  trial_end?: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  renewal_date?: string | null;
  canceled_at?: string | null;
};

export type FeatureCheckResult = {
  allowed: boolean;
  reason?: string;
  status?: string;
  current?: number;
  limit?: number;
  feature?: string;
};

export type Order = {
  id: string;
  restaurant_id: string;
  status: OrderStatus;
  fulfillment: Fulfillment;
  payment_mode: PaymentMode;
  payment_status: PaymentStatus | null;
  customer_name: string | null;
  customer_phone: string | null;
  address: string | null;
  table_number: string | null;
  subtotal: number;
  delivery_fee: number;
  total: number;
  notes: string | null;
  idempotency_key: string | null;
  estimated_prep_minutes: number;
  created_at: string;
  order_items?: OrderItem[];
};

export type OrderStatusHistoryEntry = {
  id: string;
  order_id: string;
  previous_status: OrderStatus | null;
  new_status: OrderStatus;
  changed_by: string | null;
  changed_at: string;
};

export type OrderItem = {
  id: string;
  order_id: string;
  product_id: string | null;
  name: string;
  unit_price: number;
  quantity: number;
  modifiers: ModifierSelection[];
  line_total: number;
};

export type ModifierSelection = {
  id: string;
  name: string;
  price_delta: number;
};

export type CartItem = {
  id: string;
  product_id: string;
  name: string;
  unit_price: number;
  quantity: number;
  image_url: string | null;
  selected_modifiers: ModifierSelection[];
  line_total: number;
};

export type RestaurantUser = {
  id: string;
  user_id: string;
  restaurant_id: string;
  role: StaffRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AuthUser = {
  id: string;
  email: string;
  restaurantId: string | null;
  restaurantSlug: string | null;
  role: StaffRole | 'SuperAdmin';
  isActive: boolean;
};

export type DeliveryStatus =
  | 'ready'
  | 'assigned'
  | 'picked_up'
  | 'out_for_delivery'
  | 'delivered'
  | 'failed'
  | 'canceled';

export type DriverAssignment = {
  id: string;
  order_id: string;
  driver_user_id: string | null;
  restaurant_id: string;
  status: DeliveryStatus;
  assigned_at: string;
  picked_up_at: string | null;
  delivered_at: string | null;
  failed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type NotificationEvent =
  | 'order_received'
  | 'payment_approved'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'canceled'
  | 'new_order'
  | 'delivery_assigned'
  | 'delivery_changed'
  | 'delivery_canceled'
  | 'delivery_failed';

export type NotificationChannel = 'in_app' | 'whatsapp' | 'email' | 'push' | 'sms';

export type Notification = {
  id: string;
  restaurant_id: string | null;
  order_id: string | null;
  recipient_type: 'customer' | 'restaurant' | 'driver' | 'admin';
  recipient_id: string | null;
  recipient_contact: string | null;
  event_type: NotificationEvent;
  channel: NotificationChannel;
  status: 'pending' | 'sent' | 'failed' | 'delivered' | 'read';
  payload: Record<string, unknown>;
  created_at: string;
  sent_at: string | null;
};

export type DriverDelivery = {
  order_id: string;
  status: OrderStatus;
  delivery_status: DeliveryStatus | null;
  customer_name: string | null;
  customer_phone: string | null;
  address: string | null;
  total: number;
  created_at: string;
  restaurant_name: string;
  restaurant_address: string | null;
  assignment_status: DeliveryStatus;
  items: { name: string; quantity: number; line_total: number }[];
};

export type RestaurantAnalytics = {
  success: boolean;
  error?: string;
  revenue: number;
  order_count: number;
  avg_ticket: number;
  delivery_count: number;
  table_count: number;
  canceled_count: number;
  pay_now_count: number;
  pay_later_count: number;
  pay_now_revenue: number;
  pay_later_revenue: number;
};

export type ProductAnalyticsRow = {
  name: string;
  quantity: number;
  revenue: number;
  unit_price: number;
};

export type CategoryAnalyticsRow = {
  category: string;
  quantity: number;
  revenue: number;
};

export type ProductAnalytics = {
  success: boolean;
  error?: string;
  products: ProductAnalyticsRow[];
  categories: CategoryAnalyticsRow[];
};

export type OrderAnalytics = {
  success: boolean;
  error?: string;
  total_orders: number;
  completed_orders: number;
  canceled_orders: number;
  avg_prep_minutes: number;
  avg_delivery_minutes: number;
  cancellation_rate: number;
  payment_success_rate: number;
};

export type PeakHour = {
  hour: number;
  count: number;
};

export type PeakHoursResult = {
  success: boolean;
  error?: string;
  hours: PeakHour[];
};

export type PlatformMetrics = {
  success: boolean;
  error?: string;
  total_restaurants: number;
  active_restaurants: number;
  trial_restaurants: number;
  suspended_restaurants: number;
  canceled_restaurants: number;
  total_orders: number;
  platform_revenue: number;
  subscription_metrics: { plan_name: string; count: number }[];
};

export type AdminRestaurantRow = {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  subscription_status: string;
  is_open: boolean;
  created_at: string;
  order_count: number;
  revenue: number;
};

export type AdminRestaurantsResult = {
  success: boolean;
  error?: string;
  restaurants: AdminRestaurantRow[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
};

export type AuditLog = {
  id: string;
  actor_email: string;
  action: string;
  tenant_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type AuditLogsResult = {
  success: boolean;
  error?: string;
  logs: AuditLog[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
};
