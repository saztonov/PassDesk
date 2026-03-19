import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

const SkudSiteAccessPoint = sequelize.define('SkudSiteAccessPoint', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4,
  },
  constructionSiteId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'construction_site_id',
  },
  sigurAccessPointId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'sigur_access_point_id',
  },
  createdAt: {
    type: DataTypes.DATE,
    field: 'created_at',
  },
}, {
  tableName: 'skud_site_access_points',
  timestamps: false,
  indexes: [
    { name: 'idx_skud_site_access_points_site', fields: ['construction_site_id'] },
  ],
});

export default SkudSiteAccessPoint;
