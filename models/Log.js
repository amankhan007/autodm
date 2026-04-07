const { getDB } = require('../config/database');

function mapLog(row) {
  if (!row) return null;
  return {
    _id: row.id, id: row.id,
    userId: row.user_id,
    campaignId: row.campaign_id,
    postId: row.post_id,
    commentId: row.comment_id,
    commentText: row.comment_text,
    commenterId: row.commenter_id,
    commenterUsername: row.commenter_username,
    dmStatus: row.dm_status,
    dmMessageId: row.dm_message_id,
    messageSent: row.message_sent,
    errorMessage: row.error_message,
    errorCode: row.error_code,
    skipReason: row.skip_reason,
    commentReceivedAt: row.comment_received_at,
    dmSentAt: row.dm_sent_at,
    processingDelayMs: row.processing_delay_ms,
    jobId: row.job_id,
    retryCount: row.retry_count,
    createdAt: row.created_at,
  };
}

const Log = {
  async create(fields) {
    const { data, error } = await getDB().from('logs').insert({
      user_id:            fields.userId,
      campaign_id:        fields.campaignId || null,
      post_id:            fields.postId || null,
      comment_id:         fields.commentId || null,
      comment_text:       fields.commentText ? String(fields.commentText).slice(0, 500) : null,
      commenter_id:       fields.commenterId || null,
      commenter_username: fields.commenterUsername || null,
      dm_status:          fields.dmStatus || 'pending',
      dm_message_id:      fields.dmMessageId || null,
      message_sent:       fields.messageSent || null,
      error_message:      fields.errorMessage ? String(fields.errorMessage).slice(0, 500) : null,
      error_code:         fields.errorCode || null,
      skip_reason:        fields.skipReason || null,
      comment_received_at: fields.commentReceivedAt || null,
      dm_sent_at:         fields.dmSentAt || null,
      processing_delay_ms: fields.processingDelayMs || null,
      job_id:             fields.jobId || null,
      retry_count:        fields.retryCount || 0,
    }).select().single();
    if (error) throw new Error(error.message);
    return mapLog(data);
  },

  async update(id, fields) {
    const patch = {};
    if (fields.dmStatus !== undefined)        patch.dm_status = fields.dmStatus;
    if (fields.dmMessageId !== undefined)     patch.dm_message_id = fields.dmMessageId;
    if (fields.messageSent !== undefined)     patch.message_sent = fields.messageSent;
    if (fields.errorMessage !== undefined)    patch.error_message = fields.errorMessage;
    if (fields.errorCode !== undefined)       patch.error_code = fields.errorCode;
    if (fields.skipReason !== undefined)      patch.skip_reason = fields.skipReason;
    if (fields.dmSentAt !== undefined)        patch.dm_sent_at = fields.dmSentAt;
    if (fields.processingDelayMs !== undefined) patch.processing_delay_ms = fields.processingDelayMs;
    if (fields.jobId !== undefined)           patch.job_id = fields.jobId;
    if (fields.retryCount !== undefined)      patch.retry_count = fields.retryCount;
    if (Object.keys(patch).length === 0) return;
    await getDB().from('logs').update(patch).eq('id', id);
  },

  async find({ userId, campaignId, dmStatus, from, to, page = 1, limit = 50 } = {}) {
    let q = getDB().from('logs').select('*, campaigns(name)', { count: 'exact' });
    if (userId)     q = q.eq('user_id', userId);
    if (campaignId) q = q.eq('campaign_id', campaignId);
    if (dmStatus)   q = q.eq('dm_status', dmStatus);
    if (from)       q = q.gte('created_at', new Date(from).toISOString());
    if (to)         q = q.lte('created_at', new Date(to).toISOString());
    q = q.order('created_at', { ascending: false })
         .range((page - 1) * limit, page * limit - 1);
    const { data, count } = await q;
    return {
      logs: (data || []).map(row => {
        const l = mapLog(row);
        if (row.campaigns) l.campaignId = row.campaigns; // populate
        return l;
      }),
      total: count || 0,
    };
  },

  async findRecent(userId, limit = 20) {
    const { data } = await getDB().from('logs').select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data || []).map(mapLog);
  },

  async count(query = {}) {
    let q = getDB().from('logs').select('*', { count: 'exact', head: true });
    if (query.userId)     q = q.eq('user_id', query.userId);
    if (query.dmStatus)   q = q.eq('dm_status', query.dmStatus);
    if (query.createdAt?.$gte) q = q.gte('created_at', query.createdAt.$gte.toISOString());
    if (query.createdAt?.$lte) q = q.lte('created_at', query.createdAt.$lte.toISOString());
    const { count } = await q;
    return count || 0;
  },

  async exportAll({ userId, dmStatus, from, to } = {}) {
    let q = getDB().from('logs').select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5000);
    if (dmStatus) q = q.eq('dm_status', dmStatus);
    if (from)     q = q.gte('created_at', new Date(from).toISOString());
    if (to)       q = q.lte('created_at', new Date(to).toISOString());
    const { data } = await q;
    return (data || []).map(mapLog);
  },
};

module.exports = Log;
