const express = require('express');
const Certificate = require('../models/Certificate');

const router = express.Router();

const escapeRegex = (value) =>
  String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeNumber = (value) => String(value || '').trim();

const mapVerificationResult = (certificate) => ({
  certificateNumber: certificate.certificate_number,
  status: certificate.status || 'issued',
  issuedAt: certificate.issued_at || certificate.createdAt,
  student: certificate.user_id
    ? {
        name: certificate.user_id.name,
        email: certificate.user_id.email
      }
    : null,
  course: certificate.course_id
    ? {
        title: certificate.course_id.title,
        slug: certificate.course_id.slug
      }
    : null,
  cohort: certificate.cohort_id
    ? {
        name: certificate.cohort_id.name
      }
    : null
});

const handleVerify = async (req, res) => {
  try {
    const input =
      normalizeNumber(req.params.certificateNumber) ||
      normalizeNumber(req.query.number);

    if (!input) {
      return res.status(400).json({
        verified: false,
        message: 'Certificate number is required.'
      });
    }

    const certificate = await Certificate.findOne({
      certificate_number: {
        $regex: `^${escapeRegex(input)}$`,
        $options: 'i'
      }
    })
      .populate('user_id', 'name email')
      .populate('course_id', 'title slug')
      .populate('cohort_id', 'name')
      .lean();

    if (!certificate) {
      return res.status(404).json({
        verified: false,
        message: 'Certificate record not found.'
      });
    }

    if ((certificate.status || 'issued') !== 'issued') {
      return res.status(200).json({
        verified: false,
        message: 'Certificate record exists but is not active.',
        certificate: mapVerificationResult(certificate)
      });
    }

    res.json({
      verified: true,
      message: 'Certificate is valid.',
      certificate: mapVerificationResult(certificate)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

router.get('/verify/:certificateNumber', handleVerify);
router.get('/verify', handleVerify);

module.exports = router;
