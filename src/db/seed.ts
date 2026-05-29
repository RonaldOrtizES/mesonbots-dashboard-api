/**
 * Script de seed para poblar la base de datos con datos de ejemplo.
 *
 * Uso:
 *   npm run seed
 *
 * Esto crea:
 * - Un tenant: "Taller Don Beto" usando el personaje "Don Tito"
 * - Un usuario admin: don.beto@taller.com / password: "mesonbots2026"
 * - 10 clientes finales con historial
 * - 11 citas (próximas y pasadas)
 * - 8 conversaciones con mensajes
 * - Suscripción activa Plan Vecino
 * - Métricas de los últimos 7 días
 */

import bcrypt from 'bcryptjs';
import { query, transaction } from './client';

async function seed() {
  console.log('🌱 Iniciando seed de Mesonbots...');

  await transaction(async (client) => {
    // 1. Buscar el personaje Don Tito (debe existir por el schema inicial)
    const charResult = await client.query<{ id: string }>(
      `SELECT id FROM characters WHERE slug = 'don-tito' LIMIT 1`
    );

    if (charResult.rows.length === 0) {
      throw new Error('⚠️ Don Tito no existe en characters. Ejecutá el schema primero.');
    }
    const donTitoId = charResult.rows[0]!.id;

    // 2. Crear tenant
    console.log('🏪 Creando tenant: Taller Don Beto...');

    const tenantResult = await client.query<{ id: string }>(
      `INSERT INTO tenants (
         business_name, business_slug, business_type,
         owner_name, owner_email, owner_phone,
         whatsapp_phone, whatsapp_phone_id, whatsapp_business_account_id,
         whatsapp_verified, character_id, character_custom_name,
         plan, status, loyalty_tier,
         timezone, language,
         address, city, country,
         activated_at
       )
       VALUES (
         'Taller Don Beto', 'taller-don-beto', 'Taller mecánico',
         'Beto Martínez', 'don.beto@taller.com', '+503 7234-5678',
         '+503 7234-5678', 'demo_phone_id', 'demo_waba_id',
         true, $1, 'Don Beto',
         'vecino', 'active', 'conocido',
         'America/El_Salvador', 'es-SV',
         'Colonia Escalón, Calle Los Pinos #234', 'San Salvador', 'El Salvador',
         NOW() - INTERVAL '2 months'
       )
       ON CONFLICT (owner_email) DO UPDATE
       SET business_name = EXCLUDED.business_name
       RETURNING id`,
      [donTitoId]
    );
    const tenantId = tenantResult.rows[0]!.id;
    console.log(`  ✓ Tenant ID: ${tenantId}`);

    // 3. Crear usuario admin del dashboard
    console.log('👤 Creando usuario admin...');
    const passwordHash = await bcrypt.hash('mesonbots2026', 10);

    await client.query(
      `INSERT INTO dashboard_users (
         tenant_id, email, full_name, phone,
         role, password_hash, email_verified, is_active
       )
       VALUES (
         $1, 'don.beto@taller.com', 'Beto Martínez', '+503 7234-5678',
         'owner', $2, true, true
       )
       ON CONFLICT (tenant_id, email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash`,
      [tenantId, passwordHash]
    );

    // 4. Crear servicios
    console.log('🔧 Creando servicios del taller...');
    await client.query(
      `INSERT INTO services (tenant_id, name, description, category, duration_minutes, price_usd, display_order)
       VALUES
         ($1, 'Cambio de aceite', 'Incluye aceite 5W-30 y filtro', 'mantenimiento', 45, 35.00, 1),
         ($1, 'Alineación y balanceo', NULL, 'mantenimiento', 60, 25.00, 2),
         ($1, 'Revisión de frenos', 'Diagnóstico completo del sistema de frenos', 'diagnostico', 90, 20.00, 3),
         ($1, 'Diagnóstico general', NULL, 'diagnostico', 60, 15.00, 4),
         ($1, 'Cambio de pastillas de freno', NULL, 'reparacion', 90, 45.00, 5),
         ($1, 'Reparación de motor', 'Cotización requerida', 'reparacion', 480, 0.00, 6)
       ON CONFLICT DO NOTHING`,
      [tenantId]
    );

    // 5. Crear clientes finales
    console.log('👥 Creando 10 clientes finales...');
    const clientes = [
      ['José Martínez', '+503 7012-3456', true, 18, 12, 0, 'Lleva su Toyota Corolla 2018. Le gusta el cambio de aceite cada 5000km.'],
      ['María González', '+503 7234-5670', false, 6, 3, 1, null],
      ['Carlos Hernández', '+503 7345-6789', true, 24, 19, 2, 'Cliente desde 2024. Atendelo bien.'],
      ['Ana Rodríguez', '+503 7456-7890', false, 4, 2, 3, null],
      ['Luis Pérez', '+503 7567-8901', false, 9, 5, 4, null],
      ['Rosa Mendoza', '+503 7678-9012', true, 32, 28, 5, 'Familia con 3 carros. Buenísima clienta.'],
      ['Mario Funes', '+503 7789-0123', false, 3, 1, 7, null],
      ['Patricia Aguilar', '+503 7890-1234', false, 8, 4, 10, null],
      ['Roberto Castillo', '+503 7901-2345', false, 5, 2, 12, null],
      ['Karla Romero', '+503 7012-3450', false, 7, 3, 14, null]
    ] as const;

    const clienteIds: string[] = [];
    for (const [nombre, phone, vip, convs, citas, diasAtras, notas] of clientes) {
      const r = await client.query<{ id: string }>(
        `INSERT INTO end_customers (
           tenant_id, whatsapp_phone, name, is_vip,
           total_conversations, total_appointments,
           first_contact_at, last_contact_at, notes
         )
         VALUES ($1, $2, $3, $4, $5, $6, NOW() - INTERVAL '${30} days', NOW() - INTERVAL '${diasAtras} days', $7)
         ON CONFLICT (tenant_id, whatsapp_phone) DO UPDATE
         SET name = EXCLUDED.name, is_vip = EXCLUDED.is_vip,
             total_conversations = EXCLUDED.total_conversations,
             total_appointments = EXCLUDED.total_appointments,
             last_contact_at = EXCLUDED.last_contact_at,
             notes = EXCLUDED.notes
         RETURNING id`,
        [tenantId, phone, nombre, vip, convs, citas, notas]
      );
      clienteIds.push(r.rows[0]!.id);
    }

    // 6. Crear citas
    console.log('📅 Creando citas...');
    const citasData = [
      ['José Martínez', '+503 7012-3456', 'Cambio de aceite', 2, 45, 'confirmed', 'Placa P123-456'],
      ['María González', '+503 7234-5670', 'Revisión de frenos', 4, 90, 'confirmed', null],
      ['Carlos Hernández', '+503 7345-6789', 'Alineación y balanceo', 6, 60, 'reminded', null],
      ['Rosa Mendoza', '+503 7678-9012', 'Diagnóstico general', 25, 60, 'confirmed', 'Hace un ruido extraño cuando frena'],
      ['Luis Pérez', '+503 7567-8901', 'Cambio de aceite', 27, 45, 'confirmed', null],
      ['Ana Rodríguez', '+503 7456-7890', 'Cambio de pastillas de freno', 48, 90, 'pending', null],
      ['Mario Funes', '+503 7789-0123', 'Revisión de frenos', 52, 90, 'confirmed', null],
      ['Patricia Aguilar', '+503 7890-1234', 'Alineación y balanceo', 73, 60, 'confirmed', null],
      ['Roberto Castillo', '+503 7901-2345', 'Cambio de aceite', -24, 45, 'completed', null],
      ['Karla Romero', '+503 7012-3450', 'Diagnóstico general', -48, 60, 'completed', null],
      ['Carlos Hernández', '+503 7345-6789', 'Revisión de frenos', -72, 90, 'no_show', null]
    ] as const;

    for (const [nombre, phone, servicio, horasOffset, duracion, estado, notas] of citasData) {
      await client.query(
        `INSERT INTO appointments (
           tenant_id, customer_name, customer_phone, service_name,
           scheduled_at, duration_minutes, status, notes, created_via
         )
         VALUES ($1, $2, $3, $4, NOW() + ($5 || ' hours')::interval, $6, $7::appointment_status, $8, 'bot')`,
        [tenantId, nombre, phone, servicio, horasOffset, duracion, estado, notas]
      );
    }

    // 7. Crear conversaciones
    console.log('💬 Creando conversaciones...');
    const convsData = [
      ['José Martínez', '+503 7012-3456', 'open', '¿A qué hora puedo pasar a recoger el carro?', 5, 2, 8, false],
      ['María González', '+503 7234-5670', 'open', 'Perfecto, ahí nos vemos. ¡Gracias!', 18, 0, 12, true],
      ['Carlos Hernández', '+503 7345-6789', 'open', 'Mañana a las 6 paso. ¿Cuánto sale?', 42, 1, 5, false],
      ['Rosa Mendoza', '+503 7678-9012', 'open', 'Don Tito le envió: Su cita queda confirmada 📅', 60, 0, 6, true],
      ['Luis Pérez', '+503 7567-8901', 'open', '¿Hacen revisión de transmisión?', 120, 1, 3, false],
      ['Mario Funes', '+503 7789-0123', 'escalated', 'El cliente solicita hablar con un humano', 180, 1, 9, false],
      ['Ana Rodríguez', '+503 7456-7890', 'closed', 'Don Tito le envió: ¡Gracias por su preferencia! 🔧', 300, 0, 14, true],
      ['Patricia Aguilar', '+503 7890-1234', 'closed', 'Perfecto, gracias!', 1440, 0, 7, true]
    ] as const;

    const convIds: string[] = [];
    for (const [nombre, phone, estado, ultimoMsg, minAtras, _unread, total, _resuelto] of convsData) {
      const r = await client.query<{ id: string }>(
        `INSERT INTO conversations (
           tenant_id, customer_phone, customer_name, status,
           total_messages, inbound_messages, outbound_messages,
           last_message_at, first_message_at, closed_at
         )
         VALUES (
           $1, $2, $3, $4::conversation_status,
           $5, $6, $7,
           NOW() - ($8 || ' minutes')::interval,
           NOW() - ($8 || ' minutes')::interval - INTERVAL '30 minutes',
           CASE WHEN $4 = 'closed' THEN NOW() - ($8 || ' minutes')::interval ELSE NULL END
         )
         RETURNING id`,
        [tenantId, phone, nombre, estado, total, Math.floor(total/2), Math.ceil(total/2), minAtras]
      );
      convIds.push(r.rows[0]!.id);

      // Mensaje final solamente (para mantener seed liviano)
      await client.query(
        `INSERT INTO messages (
           conversation_id, tenant_id, direction, message_type,
           content, generated_by_ai, delivery_status, created_at
         )
         VALUES (
           $1, $2, $3, 'text', $4, $5, 'read',
           NOW() - ($6 || ' minutes')::interval
         )`,
        [
          r.rows[0]!.id, tenantId,
          ultimoMsg.startsWith('Don Tito') ? 'outbound' : 'inbound',
          ultimoMsg, ultimoMsg.startsWith('Don Tito'), minAtras
        ]
      );
    }

    // Mensajes detallados para la primera conversación (José Martínez)
    if (convIds[0]) {
      console.log('💬 Creando mensajes detallados para José Martínez...');
      const primerConvId = convIds[0];
      const mensajes = [
        [35, 'inbound', 'Buenas don, ¿estarán abiertos hoy?', false],
        [34, 'outbound', '¡A la orden, jefe! 🔧 Sí estamos abiertos hoy hasta las 6 de la tarde. ¿En qué le podemos ayudar?', true],
        [32, 'inbound', 'Mi carro está haciendo un ruido raro al frenar. ¿Cuánto cobran por revisarlo?', false],
        [31, 'outbound', 'Eso lo revisamos sin problema, don. La revisión de frenos cuesta $20 e incluye diagnóstico completo del sistema. Si necesita reemplazo de pastillas, son $45 adicionales con repuesto incluido. ¿Le agendo una cita?', true],
        [28, 'inbound', 'Sí, hoy en la tarde si se puede', false],
        [27, 'outbound', 'Perfecto, jefe. Para hoy tengo disponibles:\n\n📅 3:00 PM\n📅 4:30 PM\n📅 5:30 PM\n\n¿Cuál le acomoda mejor?', true],
        [22, 'inbound', 'A las 3 está bien. Voy en el Corolla blanco placa P123-456', false],
        [21, 'outbound', 'Listo, don José. Su cita queda así:\n\n📅 Hoy, 3:00 PM\n🚗 Toyota Corolla - P123-456\n🔧 Revisión de frenos\n💰 $20 (diagnóstico)\n\nLe esperamos. ¡A la orden!', true]
      ] as const;

      for (const [minAtras, direccion, contenido, esIA] of mensajes) {
        await client.query(
          `INSERT INTO messages (
             conversation_id, tenant_id, direction, message_type,
             content, generated_by_ai, delivery_status, created_at
           )
           VALUES (
             $1, $2, $3::message_direction, 'text', $4, $5, 'read',
             NOW() - ($6 || ' minutes')::interval
           )`,
          [primerConvId, tenantId, direccion, contenido, esIA, minAtras]
        );
      }
    }

    // 8. Crear suscripción
    console.log('💎 Creando suscripción activa...');
    await client.query(
      `INSERT INTO subscriptions (
         tenant_id, plan, status,
         base_price_usd, discount_percent, final_price_usd,
         included_notifications, included_marketing,
         max_users, max_locations, max_characters,
         current_period_start, current_period_end,
         notifications_used, marketing_used,
         next_billing_date, billing_cycle,
         loyalty_locked, trial_started_at, trial_ends_at
       )
       VALUES (
         $1, 'vecino', 'active',
         79.00, 5.00, 75.05,
         1200, 50,
         3, 1, 1,
         DATE_TRUNC('month', NOW())::date,
         (DATE_TRUNC('month', NOW()) + INTERVAL '1 month - 1 day')::date,
         847, 23,
         (DATE_TRUNC('month', NOW()) + INTERVAL '1 month')::date,
         'monthly',
         false,
         NOW() - INTERVAL '2 months',
         NOW() - INTERVAL '2 months' + INTERVAL '14 days'
       )
       ON CONFLICT DO NOTHING`,
      [tenantId]
    );

    // 9. Crear facturas pasadas
    console.log('🧾 Creando facturas...');
    const facturas = [
      ['MBT-2026-0001', 'Plan Vecino - Marzo', 79.00, 2],
      ['MBT-2026-0002', 'Plan Vecino - Abril', 79.00, 1],
      ['MBT-2026-0003', 'Plan Vecino - Mayo (con descuento)', 75.05, 0]
    ] as const;

    for (const [numero, concepto, monto, mesesAtras] of facturas) {
      await client.query(
        `INSERT INTO invoices (
           tenant_id, invoice_number, period_start, period_end,
           subtotal_usd, total_usd, line_items,
           status, due_date, paid_at, payment_method
         )
         VALUES (
           $1, $2,
           (DATE_TRUNC('month', NOW()) - ($3 || ' months')::interval)::date,
           (DATE_TRUNC('month', NOW()) - (($3::int - 1) || ' months')::interval - INTERVAL '1 day')::date,
           $4, $4,
           $5::jsonb,
           'paid'::invoice_status,
           (DATE_TRUNC('month', NOW()) - ($3 || ' months')::interval + INTERVAL '15 days')::date,
           DATE_TRUNC('month', NOW()) - ($3 || ' months')::interval + INTERVAL '15 days',
           'transfer'::payment_method
         )
         ON CONFLICT (invoice_number) DO NOTHING`,
        [tenantId, numero, mesesAtras, monto, JSON.stringify([{ concept: concepto, amount: monto }])]
      );
    }

    // 10. Crear métricas de los últimos 7 días
    console.log('📊 Creando métricas diarias...');
    for (let i = 6; i >= 0; i--) {
      const mensajesEntrada = 25 + Math.floor(Math.random() * 50);
      const mensajesSalida = 40 + Math.floor(Math.random() * 70);
      const conversacionesNuevas = 3 + Math.floor(Math.random() * 8);
      const citasCreadas = 1 + Math.floor(Math.random() * 6);
      const citasCanceladas = Math.floor(Math.random() * 2);
      const costoTotal = 0.5 + Math.random() * 2.5;

      await client.query(
        `INSERT INTO metrics_daily (
           tenant_id, date,
           messages_inbound, messages_outbound,
           conversations_opened, conversations_resolved_by_ai,
           new_customers, unique_customers,
           appointments_created, appointments_cancelled, appointments_completed,
           cost_whatsapp_usd, cost_ai_usd, cost_total_usd
         )
         VALUES (
           $1, CURRENT_DATE - ($2 || ' days')::interval,
           $3, $4, $5, $5,
           $6, $6,
           $7, $8, $7,
           $9, $10, $11
         )
         ON CONFLICT (tenant_id, date) DO UPDATE
         SET messages_inbound = EXCLUDED.messages_inbound,
             messages_outbound = EXCLUDED.messages_outbound`,
        [
          tenantId, i,
          mensajesEntrada, mensajesSalida,
          conversacionesNuevas,
          Math.floor(conversacionesNuevas * 0.6),
          citasCreadas, citasCanceladas,
          costoTotal * 0.6, costoTotal * 0.4, costoTotal
        ]
      );
    }
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Seed completado correctamente');
  console.log('');
  console.log('📧 Email:    don.beto@taller.com');
  console.log('🔑 Password: mesonbots2026');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  process.exit(0);
}

seed().catch(err => {
  console.error('❌ Error en seed:', err);
  process.exit(1);
});
