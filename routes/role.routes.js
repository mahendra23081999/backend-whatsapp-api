import express from 'express';
import roleController from '../controllers/role.controller.js';

const router = express.Router();

router.get('/', roleController.getRoles);
router.post('/create', roleController.createRole);
router.get('/permissions', roleController.getAllPermission);
router.get('/:id', roleController.getRoleById);
router.put('/:id', roleController.updateRole);
router.delete('/delete', roleController.deleteRoles);
router.patch('/:id/status', roleController.toggleRoleStatus);

export default router;
