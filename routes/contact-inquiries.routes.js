import express from 'express';
import contactInquiryController from '../controllers/contact-inquiries.controller.js';
const router = express.Router();

router.get('/all', contactInquiryController.getAllInquiries);
router.post('/create', contactInquiryController.createInquiry);
router.delete('/delete', contactInquiryController.deleteInquiry);

export default router;