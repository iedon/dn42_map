# -*- coding: utf-8 -*-
# Generated by the protocol buffer compiler.  DO NOT EDIT!
# NO CHECKED-IN PROTOBUF GENCODE
# source: message.proto
# Protobuf Python Version: 5.29.3
"""Generated protocol buffer code."""
from google.protobuf import descriptor as _descriptor
from google.protobuf import descriptor_pool as _descriptor_pool
from google.protobuf import runtime_version as _runtime_version
from google.protobuf import symbol_database as _symbol_database
from google.protobuf.internal import builder as _builder
_runtime_version.ValidateProtobufRuntimeVersion(
    _runtime_version.Domain.PUBLIC,
    5,
    29,
    3,
    '',
    'message.proto'
)
# @@protoc_insertion_point(imports)

_sym_db = _symbol_database.Default()




DESCRIPTOR = _descriptor_pool.Default().AddSerializedFile(b'\n\rmessage.proto\x12\tdn42graph\";\n\x08Metadata\x12\x0e\n\x06vendor\x18\x01 \x01(\t\x12\x11\n\ttimestamp\x18\x02 \x01(\x03\x12\x0c\n\x04time\x18\x03 \x01(\t\"L\n\x04IPv6\x12\x10\n\x08high_h32\x18\x01 \x01(\r\x12\x10\n\x08high_l32\x18\x02 \x01(\r\x12\x0f\n\x07low_h32\x18\x03 \x01(\r\x12\x0f\n\x07low_l32\x18\x04 \x01(\r\"M\n\x04\x43IDR\x12\x0e\n\x06length\x18\x01 \x01(\r\x12\x0e\n\x04ipv4\x18\x02 \x01(\rH\x00\x12\x1f\n\x04ipv6\x18\x03 \x01(\x0b\x32\x0f.dn42graph.IPv6H\x00\x42\x04\n\x02ip\"B\n\x04Node\x12\x0b\n\x03\x61sn\x18\x01 \x01(\r\x12\x0c\n\x04\x64\x65sc\x18\x02 \x01(\t\x12\x1f\n\x06routes\x18\x03 \x03(\x0b\x32\x0f.dn42graph.CIDR\"&\n\x04Link\x12\x0e\n\x06source\x18\x01 \x01(\r\x12\x0e\n\x06target\x18\x02 \x01(\r\"n\n\x05Graph\x12%\n\x08metadata\x18\x01 \x01(\x0b\x32\x13.dn42graph.Metadata\x12\x1e\n\x05nodes\x18\x02 \x03(\x0b\x32\x0f.dn42graph.Node\x12\x1e\n\x05links\x18\x03 \x03(\x0b\x32\x0f.dn42graph.Linkb\x06proto3')

_globals = globals()
_builder.BuildMessageAndEnumDescriptors(DESCRIPTOR, _globals)
_builder.BuildTopDescriptorsAndMessages(DESCRIPTOR, 'message_pb2', _globals)
if not _descriptor._USE_C_DESCRIPTORS:
  DESCRIPTOR._loaded_options = None
  _globals['_METADATA']._serialized_start=28
  _globals['_METADATA']._serialized_end=87
  _globals['_IPV6']._serialized_start=89
  _globals['_IPV6']._serialized_end=165
  _globals['_CIDR']._serialized_start=167
  _globals['_CIDR']._serialized_end=244
  _globals['_NODE']._serialized_start=246
  _globals['_NODE']._serialized_end=312
  _globals['_LINK']._serialized_start=314
  _globals['_LINK']._serialized_end=352
  _globals['_GRAPH']._serialized_start=354
  _globals['_GRAPH']._serialized_end=464
# @@protoc_insertion_point(module_scope)
